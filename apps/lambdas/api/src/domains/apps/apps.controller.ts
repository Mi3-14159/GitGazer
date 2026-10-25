import {getGithubSettings, installGithubApp} from '@/domains/apps/github-settings';
import {unlinkInstallation} from '@/domains/github-app/unlink-installation';
import {ConflictError} from '@/shared/errors';
import {BadRequestError, NotFoundError} from '@aws-lambda-powertools/event-handler/http';
import {getLogger} from '@gitgazer/backend-core/logger';
import {createEventLogEntry} from '@gitgazer/backend-services/event-log.controller';
import {RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {gitgazerWriter} from '@gitgazer/db/schema/app';
import {integrationApps, notificationHandles, notificationRuleDestinations, webhookHandleDetails} from '@gitgazer/db/schema/gitgazer';
import {githubAppInstallations} from '@gitgazer/db/schema/github/workflows';
import {isAllowedWebhookUrl, MAX_WEBHOOK_HANDLES, type IntegrationApp, type IntegrationAppType, type NotificationHandle} from '@gitgazer/db/types';
import {and, count, eq} from 'drizzle-orm';

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

const findApp = async (tx: RdsTransaction, integrationId: string, appId: string) => {
    const [app] = await tx
        .select({appId: integrationApps.appId, type: integrationApps.type})
        .from(integrationApps)
        .where(and(eq(integrationApps.integrationId, integrationId), eq(integrationApps.appId, appId)));
    if (!app) {
        throw new NotFoundError('App not found');
    }
    return app;
};

const loadHandles = async (tx: RdsTransaction, integrationId: string, canSeeSecrets: boolean): Promise<NotificationHandle[]> => {
    const handles = await tx
        .select({
            handleId: notificationHandles.handleId,
            appId: notificationHandles.appId,
            name: notificationHandles.name,
            url: webhookHandleDetails.url,
        })
        .from(notificationHandles)
        .leftJoin(
            webhookHandleDetails,
            and(
                eq(webhookHandleDetails.integrationId, notificationHandles.integrationId),
                eq(webhookHandleDetails.handleId, notificationHandles.handleId),
            ),
        )
        .where(eq(notificationHandles.integrationId, integrationId))
        .orderBy(notificationHandles.createdAt);

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
        } else {
            result.push({appId: app.appId, type: 'webhook', createdAt, handles: handles.filter((h) => h.appId === app.appId)});
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

    await createEventLogEntry({
        integrationId,
        category: 'integration',
        type: 'success',
        title: 'App installed',
        message: `The ${type} app was installed`,
        metadata: {integrationId},
    });

    return app;
};

export const uninstallApp = async (params: Scope & {appId: string}): Promise<void> => {
    const {integrationId, integrationIds, appId} = params;

    const {app, installations} = await withRlsTransaction({
        integrationIds,
        callback: async (tx: RdsTransaction) => {
            const found = await findApp(tx, integrationId, appId);
            const linked =
                found.type === 'github'
                    ? await tx
                          .select({installationId: githubAppInstallations.installationId})
                          .from(githubAppInstallations)
                          .where(eq(githubAppInstallations.integrationId, integrationId))
                    : [];
            return {app: found, installations: linked};
        },
    });

    // Collected github.* data and org-synced members stay; only the installations are detached
    for (const {installationId} of installations) {
        await unlinkInstallation(integrationId, installationId);
    }

    await withRlsTransaction({
        integrationIds,
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            await tx.delete(integrationApps).where(and(eq(integrationApps.integrationId, integrationId), eq(integrationApps.appId, appId)));
        },
    });

    getLogger().info('App uninstalled', {integrationId, appId, appType: app.type});

    await createEventLogEntry({
        integrationId,
        category: 'integration',
        type: 'info',
        title: 'App removed',
        message: `The ${app.type} app was removed`,
        metadata: {integrationId},
    });
};

const loadHandle = async (tx: RdsTransaction, integrationId: string, handleId: string): Promise<NotificationHandle> => {
    const handle = (await loadHandles(tx, integrationId, true)).find((h) => h.handleId === handleId);
    if (!handle) {
        throw new NotFoundError('Handle not found');
    }
    return handle;
};

export const createHandle = async (params: Scope & {appId: string; name: string; url: string}): Promise<NotificationHandle> => {
    const {integrationId, integrationIds, appId} = params;
    const name = normalizeName(params.name);
    const url = assertWebhookUrl(params.url);

    return await withRlsTransaction({
        integrationIds,
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            const app = await findApp(tx, integrationId, appId);
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

            return {handleId: handle.handleId, appId, name, url, ruleCount: 0};
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
            await loadHandle(tx, integrationId, handleId);

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
