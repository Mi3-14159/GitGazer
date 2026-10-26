import {getGithubSettings, installGithubApp} from '@/domains/apps/github-settings';
import {unlinkInstallation} from '@/domains/github-app/unlink-installation';
import {ConflictError} from '@/shared/errors';
import {BadRequestError, NotFoundError} from '@aws-lambda-powertools/event-handler/http';
import {listChannels, revokeToken, slackErrorReason} from '@gitgazer/backend-core/clients/slack.client';
import {decryptToken} from '@gitgazer/backend-core/helpers/token-crypto';
import {getLogger} from '@gitgazer/backend-core/logger';
import {createEventLogEntry} from '@gitgazer/backend-services/event-log.controller';
import {loadWorkspaceForIntegration} from '@gitgazer/backend-services/slack/workspaces';
import {db, RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {gitgazerWriter} from '@gitgazer/db/schema/app';
import {
    integrationAppSlackSettings,
    integrationApps,
    notificationHandles,
    notificationRuleDestinations,
    slackHandleDetails,
    slackUserLinks,
    slackWorkspaces,
    users,
    webhookHandleDetails,
} from '@gitgazer/db/schema/gitgazer';
import {githubAppInstallations, userAssignments} from '@gitgazer/db/schema/github/workflows';
import {
    isAllowedWebhookUrl,
    MAX_SLACK_HANDLES,
    MAX_WEBHOOK_HANDLES,
    type IntegrationApp,
    type IntegrationAppType,
    type NotificationHandle,
    type SlackChannel,
} from '@gitgazer/db/types';
import {and, count, eq, inArray, isNotNull, sql} from 'drizzle-orm';

const MAX_HANDLE_NAME_LENGTH = 100;

type Scope = {integrationId: string; integrationIds: string[]};

const normalizeName = (name: unknown): string => {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (trimmed.length < 1 || trimmed.length > MAX_HANDLE_NAME_LENGTH) {
        throw new BadRequestError(`Name must be between 1 and ${MAX_HANDLE_NAME_LENGTH} characters`);
    }
    return trimmed;
};

const assertWebhookUrl = (url: unknown): string => {
    if (typeof url !== 'string' || !isAllowedWebhookUrl(url)) {
        throw new BadRequestError('Invalid webhook URL. Only HTTPS Slack incoming webhook URLs are allowed');
    }
    return url;
};

const findApp = async (tx: RdsTransaction, integrationId: string, appId: string, lock?: 'update') => {
    const query = tx
        .select({appId: integrationApps.appId, type: integrationApps.type})
        .from(integrationApps)
        .where(and(eq(integrationApps.integrationId, integrationId), eq(integrationApps.appId, appId)));
    const [app] = lock ? await query.for(lock) : await query;
    if (!app) {
        throw new NotFoundError('App not found');
    }
    return app;
};

// One Slack app per integration (unique type), so the integration alone identifies its workspace.
export const findSlackTeamId = async (tx: RdsTransaction, integrationId: string): Promise<string | undefined> => {
    const [settings] = await tx
        .select({teamId: integrationAppSlackSettings.teamId})
        .from(integrationAppSlackSettings)
        .where(eq(integrationAppSlackSettings.integrationId, integrationId));
    return settings?.teamId;
};

const loadSlackApp = async (tx: RdsTransaction, integrationId: string) => {
    const teamId = await findSlackTeamId(tx, integrationId);
    if (!teamId) return null;

    const [workspace] = await db
        .select({teamName: slackWorkspaces.teamName, disconnectedAt: slackWorkspaces.disconnectedAt})
        .from(slackWorkspaces)
        .where(eq(slackWorkspaces.teamId, teamId));
    if (!workspace) return null;

    const members = await tx
        .select({githubId: users.githubId})
        .from(userAssignments)
        .innerJoin(users, eq(users.id, userAssignments.userId))
        .where(eq(userAssignments.integrationId, integrationId));
    const githubIds = members.flatMap((m) => (m.githubId === null ? [] : [m.githubId]));

    const [linked] =
        githubIds.length === 0
            ? [{count: 0}]
            : await db
                  .select({count: count()})
                  .from(slackUserLinks)
                  .where(
                      and(eq(slackUserLinks.teamId, teamId), inArray(slackUserLinks.githubUserId, githubIds), isNotNull(slackUserLinks.slackUserId)),
                  );

    return {
        workspace: {teamId, teamName: workspace.teamName, disconnected: workspace.disconnectedAt !== null},
        linkedMemberCount: Number(linked.count),
        memberCount: members.length,
    };
};

const loadHandles = async (tx: RdsTransaction, integrationId: string, canSeeSecrets: boolean): Promise<NotificationHandle[]> => {
    const handles = await tx
        .select({
            handleId: notificationHandles.handleId,
            appId: notificationHandles.appId,
            name: notificationHandles.name,
            url: webhookHandleDetails.url,
            channelName: slackHandleDetails.channelName,
        })
        .from(notificationHandles)
        .leftJoin(
            webhookHandleDetails,
            and(
                eq(webhookHandleDetails.integrationId, notificationHandles.integrationId),
                eq(webhookHandleDetails.handleId, notificationHandles.handleId),
            ),
        )
        .leftJoin(
            slackHandleDetails,
            and(
                eq(slackHandleDetails.integrationId, notificationHandles.integrationId),
                eq(slackHandleDetails.handleId, notificationHandles.handleId),
            ),
        )
        .where(eq(notificationHandles.integrationId, integrationId))
        .orderBy(notificationHandles.createdAt, notificationHandles.name, notificationHandles.handleId);

    const counts = await tx
        .select({handleId: notificationRuleDestinations.handleId, ruleCount: count()})
        .from(notificationRuleDestinations)
        .where(eq(notificationRuleDestinations.integrationId, integrationId))
        .groupBy(notificationRuleDestinations.handleId);
    const ruleCounts = new Map(counts.map((c) => [c.handleId, Number(c.ruleCount)]));

    return handles.map((h) => ({
        handleId: h.handleId,
        appId: h.appId,
        name: h.name,
        url: canSeeSecrets ? h.url : null,
        channelName: h.channelName,
        ruleCount: ruleCounts.get(h.handleId) ?? 0,
    }));
};

const loadApps = async (tx: RdsTransaction, integrationId: string, canSeeSecrets: boolean): Promise<IntegrationApp[]> => {
    const apps = await tx
        .select({appId: integrationApps.appId, type: integrationApps.type, createdAt: integrationApps.createdAt})
        .from(integrationApps)
        .where(eq(integrationApps.integrationId, integrationId))
        .orderBy(integrationApps.createdAt);

    const handles = await loadHandles(tx, integrationId, canSeeSecrets);

    const result: IntegrationApp[] = [];
    for (const app of apps) {
        const createdAt = app.createdAt.toISOString();
        if (app.type === 'github') {
            const settings = await getGithubSettings(tx, integrationId);
            if (!settings) continue;
            result.push({
                appId: app.appId,
                type: 'github',
                createdAt,
                settings: {secret: canSeeSecrets ? settings.secret : null, orgSyncDefaultRole: settings.orgSyncDefaultRole},
            });
        } else if (app.type === 'webhook') {
            result.push({appId: app.appId, type: 'webhook', createdAt, handles: handles.filter((h) => h.appId === app.appId)});
        } else if (app.type === 'slack') {
            const slack = await loadSlackApp(tx, integrationId);
            if (!slack) continue;
            result.push({appId: app.appId, type: 'slack', createdAt, ...slack, handles: handles.filter((h) => h.appId === app.appId)});
        }
    }
    return result;
};

export const listApps = async (params: Scope & {canSeeSecrets: boolean}): Promise<IntegrationApp[]> => {
    const {integrationId, integrationIds, canSeeSecrets} = params;
    return await withRlsTransaction({
        integrationIds,
        callback: (tx: RdsTransaction) => loadApps(tx, integrationId, canSeeSecrets),
    });
};

export const installApp = async (params: Scope & {type: IntegrationAppType}): Promise<IntegrationApp> => {
    const {integrationId, integrationIds, type} = params;

    if (type === 'slack') {
        throw new BadRequestError('Slack is installed through Slack');
    }

    const app = await withRlsTransaction({
        integrationIds,
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            const [existing] = await tx
                .select({appId: integrationApps.appId})
                .from(integrationApps)
                .where(and(eq(integrationApps.integrationId, integrationId), eq(integrationApps.type, type)));
            if (existing) {
                throw new ConflictError(`A ${type} app is already installed`);
            }

            if (type === 'github') {
                await installGithubApp(tx, integrationId);
            } else {
                await tx.insert(integrationApps).values({integrationId, type});
            }

            const apps = await loadApps(tx, integrationId, true);
            return apps.find((a) => a.type === type);
        },
    });

    if (!app) {
        throw new NotFoundError('App not found');
    }

    await logAppInstalled(integrationId, type);

    return app;
};

export const logAppInstalled = async (integrationId: string, type: IntegrationAppType): Promise<void> => {
    try {
        await createEventLogEntry({
            integrationId,
            category: 'integration',
            type: 'success',
            title: 'App installed',
            message: `The ${type} app was installed`,
            metadata: {integrationId},
        });
    } catch (error) {
        getLogger().error('Failed to create event log entry for app install', {error, integrationId, appType: type});
    }
};

const MAX_DELETE_ATTEMPTS = 3;

const findLinkedInstallations = async (tx: RdsTransaction, integrationId: string) =>
    await tx
        .select({installationId: githubAppInstallations.installationId})
        .from(githubAppInstallations)
        .where(eq(githubAppInstallations.integrationId, integrationId));

// Collected github.* data and org-synced members stay; only the installations are detached
const unlinkAll = async (integrationId: string, installations: {installationId: number}[]) => {
    for (const {installationId} of installations) {
        await unlinkInstallation(integrationId, installationId);
    }
};

// Unlinking calls GitHub, so it runs outside any transaction; a link can land meanwhile and is caught by the re-check.
const deleteAppRow = async (params: Scope & {appId: string; type: IntegrationAppType}): Promise<void> => {
    const {integrationId, integrationIds, appId, type} = params;

    for (let attempt = 1; attempt <= MAX_DELETE_ATTEMPTS; attempt++) {
        const lateLinks = await withRlsTransaction({
            integrationIds,
            userName: gitgazerWriter.name,
            callback: async (tx: RdsTransaction) => {
                if (type === 'github') {
                    // Waits for in-flight links (they hold FOR SHARE) and blocks new ones until this transaction ends
                    await getGithubSettings(tx, integrationId, 'update');
                    const linked = await findLinkedInstallations(tx, integrationId);
                    if (linked.length > 0) return linked;
                }
                await tx.delete(integrationApps).where(and(eq(integrationApps.integrationId, integrationId), eq(integrationApps.appId, appId)));
                return [];
            },
        });
        if (lateLinks.length === 0) return;

        const installationIds = lateLinks.map((i) => i.installationId);
        if (attempt === MAX_DELETE_ATTEMPTS) {
            getLogger().error('Gave up removing app: installations kept being linked', {integrationId, appId, attempt, installationIds});
            throw new ConflictError('Installations are still being linked to this integration. Try removing the GitHub app again.');
        }
        getLogger().warn('Installations were linked during app removal, unlinking them', {integrationId, appId, attempt, installationIds});
        await unlinkAll(integrationId, lateLinks);
    }
};

// Revoking the bot token removes the bot from every channel, so only the last integration using the workspace releases it.
const releaseWorkspaceIfUnused = async (integrationId: string, teamId: string): Promise<void> => {
    const [released] = await db
        .delete(slackWorkspaces)
        .where(
            and(
                eq(slackWorkspaces.teamId, teamId),
                sql`not exists (select 1 from ${integrationAppSlackSettings} where ${integrationAppSlackSettings.teamId} = ${teamId})`,
            ),
        )
        .returning({botTokenCiphertext: slackWorkspaces.botTokenCiphertext});
    if (!released) return;

    getLogger().info('Slack workspace released', {integrationId});
    try {
        await revokeToken(await decryptToken(released.botTokenCiphertext));
    } catch (error) {
        getLogger().error('Failed to revoke the Slack bot token', {reason: slackErrorReason(error), integrationId});
    }
};

export const uninstallApp = async (params: Scope & {appId: string}): Promise<void> => {
    const {integrationId, integrationIds, appId} = params;

    const {app, installations, slackTeamId} = await withRlsTransaction({
        integrationIds,
        callback: async (tx: RdsTransaction) => {
            const found = await findApp(tx, integrationId, appId);
            const linked = found.type === 'github' ? await findLinkedInstallations(tx, integrationId) : [];
            // Read now: the settings row goes with the app row
            const teamId = found.type === 'slack' ? await findSlackTeamId(tx, integrationId) : undefined;
            return {app: found, installations: linked, slackTeamId: teamId};
        },
    });

    await unlinkAll(integrationId, installations);
    await deleteAppRow({integrationId, integrationIds, appId, type: app.type});
    if (slackTeamId) {
        await releaseWorkspaceIfUnused(integrationId, slackTeamId);
    }

    getLogger().info('App uninstalled', {integrationId, appId, appType: app.type});

    try {
        await createEventLogEntry({
            integrationId,
            category: 'integration',
            type: 'info',
            title: 'App removed',
            message: `The ${app.type} app was removed`,
            metadata: {integrationId},
        });
    } catch (error) {
        getLogger().error('Failed to create event log entry for app removal', {error, integrationId, appId, appType: app.type});
    }
};

const loadHandle = async (tx: RdsTransaction, integrationId: string, handleId: string): Promise<NotificationHandle> => {
    const handle = (await loadHandles(tx, integrationId, true)).find((h) => h.handleId === handleId);
    if (!handle) {
        throw new NotFoundError('Handle not found');
    }
    return handle;
};

export const listSlackChannels = async (params: Scope & {appId: string}): Promise<SlackChannel[]> => {
    const {integrationId, integrationIds, appId} = params;
    const app = await withRlsTransaction({integrationIds, callback: (tx: RdsTransaction) => findApp(tx, integrationId, appId)});
    if (app.type !== 'slack') {
        throw new BadRequestError('Not a Slack app');
    }
    const workspace = await loadWorkspaceForIntegration(integrationId);
    if (!workspace) {
        throw new NotFoundError('Slack workspace not found');
    }
    return await listChannels(workspace.botToken);
};

const createSlackHandle = async (params: Scope & {appId: string; name?: string; channelId: string}): Promise<NotificationHandle> => {
    const {integrationId, integrationIds, appId, channelId} = params;

    // Resolved before the write transaction so the app row lock is never held across a Slack call
    const channels = await listSlackChannels({integrationId, integrationIds, appId});
    const channel = channels.find((c) => c.id === channelId);
    if (!channel) {
        throw new BadRequestError('Unknown channel');
    }
    const name = normalizeName(params.name ?? `#${channel.name}`);

    return await withRlsTransaction({
        integrationIds,
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            await findApp(tx, integrationId, appId, 'update');

            const [{count: existing}] = await tx
                .select({count: count()})
                .from(notificationHandles)
                .where(and(eq(notificationHandles.integrationId, integrationId), eq(notificationHandles.appId, appId)));
            if (Number(existing) >= MAX_SLACK_HANDLES) {
                throw new BadRequestError(`A Slack app holds at most ${MAX_SLACK_HANDLES} handles`);
            }

            const [handle] = await tx
                .insert(notificationHandles)
                .values({integrationId, appId, name})
                .returning({handleId: notificationHandles.handleId});
            await tx.insert(slackHandleDetails).values({integrationId, handleId: handle.handleId, channelId, channelName: channel.name});

            return {handleId: handle.handleId, appId, name, url: null, channelName: channel.name, ruleCount: 0};
        },
    });
};

export const createHandle = async (
    params: Scope & {appId: string} & ({name: string; url: string} | {name?: string; channelId: string}),
): Promise<NotificationHandle> => {
    if ('channelId' in params) {
        return await createSlackHandle(params);
    }
    const {integrationId, integrationIds, appId} = params;
    const name = normalizeName(params.name);
    const url = assertWebhookUrl(params.url);

    return await withRlsTransaction({
        integrationIds,
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            // Serialises concurrent creates on this app so the count below can't be outrun
            const app = await findApp(tx, integrationId, appId, 'update');
            if (app.type !== 'webhook') {
                throw new BadRequestError('Handles can only be added to a Webhook app');
            }

            const [{count: existing}] = await tx
                .select({count: count()})
                .from(notificationHandles)
                .where(and(eq(notificationHandles.integrationId, integrationId), eq(notificationHandles.appId, appId)));
            if (Number(existing) >= MAX_WEBHOOK_HANDLES) {
                throw new BadRequestError(`A Webhook app holds at most ${MAX_WEBHOOK_HANDLES} handles`);
            }

            const [handle] = await tx
                .insert(notificationHandles)
                .values({integrationId, appId, name})
                .returning({handleId: notificationHandles.handleId});
            await tx.insert(webhookHandleDetails).values({integrationId, handleId: handle.handleId, url});

            return {handleId: handle.handleId, appId, name, url, channelName: null, ruleCount: 0};
        },
    });
};

export const updateHandle = async (params: Scope & {handleId: string; name?: string; url?: string}): Promise<NotificationHandle> => {
    const {integrationId, integrationIds, handleId} = params;
    const name = params.name === undefined ? undefined : normalizeName(params.name);
    const url = params.url === undefined ? undefined : assertWebhookUrl(params.url);

    if (name === undefined && url === undefined) {
        throw new BadRequestError('Nothing to update');
    }

    return await withRlsTransaction({
        integrationIds,
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            const handle = await loadHandle(tx, integrationId, handleId);
            if (url !== undefined && handle.url === null) {
                throw new BadRequestError('Only Webhook handles have a URL');
            }

            if (name !== undefined) {
                await tx
                    .update(notificationHandles)
                    .set({name, updatedAt: new Date()})
                    .where(and(eq(notificationHandles.integrationId, integrationId), eq(notificationHandles.handleId, handleId)));
            }
            if (url !== undefined) {
                await tx
                    .update(webhookHandleDetails)
                    .set({url})
                    .where(and(eq(webhookHandleDetails.integrationId, integrationId), eq(webhookHandleDetails.handleId, handleId)));
            }

            return await loadHandle(tx, integrationId, handleId);
        },
    });
};

export const deleteHandle = async (params: Scope & {handleId: string}): Promise<void> => {
    const {integrationId, integrationIds, handleId} = params;

    await withRlsTransaction({
        integrationIds,
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            const deleted = await tx
                .delete(notificationHandles)
                .where(and(eq(notificationHandles.integrationId, integrationId), eq(notificationHandles.handleId, handleId)))
                .returning({handleId: notificationHandles.handleId});
            if (deleted.length === 0) {
                throw new NotFoundError('Handle not found');
            }
        },
    });
};
