import {findSlackTeamId, insertSlackHandle, loadHandles, loadSlackBotToken} from '@/domains/apps/apps.controller';
import {BadRequestError, NotFoundError} from '@/shared/errors';
import {getChannel, slackErrorReason} from '@gitgazer/backend-core/clients/slack.client';
import {getLogger} from '@gitgazer/backend-core/logger';
import {RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {gitgazerWriter} from '@gitgazer/db/schema/app';
import {
    integrationApps,
    notificationHandles,
    notificationRuleDestinations,
    slackHandleDetails,
    webhookHandleDetails,
} from '@gitgazer/db/schema/gitgazer';
import {and, count, eq, inArray} from 'drizzle-orm';

type Scope = {integrationId: string; integrationIds: string[]};

export type WebhookMove = {webhookHandleId: string; channelId: string};

export const webhookTeamId = (url: string): string | null => url.match(/^https:\/\/hooks\.slack\.com\/services\/(T[A-Z0-9]+)\//)?.[1] ?? null;

export const listMoveCandidates = async ({integrationId, integrationIds}: Scope): Promise<{handleId: string; name: string; ruleCount: number}[]> =>
    await withRlsTransaction({
        integrationIds,
        callback: async (tx: RdsTransaction) => {
            const teamId = await findSlackTeamId(tx, integrationId);
            if (!teamId) return [];
            const handles = await loadHandles(tx, integrationId);
            return handles
                .filter((h) => h.url !== null && webhookTeamId(h.url) === teamId)
                .map(({handleId, name, ruleCount}) => ({handleId, name, ruleCount}));
        },
    });

const moveHandle = async (
    tx: RdsTransaction,
    params: {integrationId: string; appId: string; webhookHandleId: string; channel: {id: string; name: string}},
): Promise<void> => {
    const {integrationId, appId, webhookHandleId, channel} = params;

    const [webhook] = await tx
        .select({handleId: webhookHandleDetails.handleId})
        .from(webhookHandleDetails)
        .where(and(eq(webhookHandleDetails.integrationId, integrationId), eq(webhookHandleDetails.handleId, webhookHandleId)));
    if (!webhook) {
        throw new NotFoundError('Handle not found');
    }

    const [existing] = await tx
        .select({handleId: slackHandleDetails.handleId})
        .from(slackHandleDetails)
        .where(and(eq(slackHandleDetails.integrationId, integrationId), eq(slackHandleDetails.channelId, channel.id)));
    const slackHandleId =
        existing?.handleId ??
        (await insertSlackHandle(tx, {integrationId, appId, name: `#${channel.name}`, channelId: channel.id, channelName: channel.name})).handleId;

    // A rule that already targets the channel keeps that destination; the webhook one would collide on the primary key
    await tx.delete(notificationRuleDestinations).where(
        and(
            eq(notificationRuleDestinations.integrationId, integrationId),
            eq(notificationRuleDestinations.handleId, webhookHandleId),
            inArray(
                notificationRuleDestinations.ruleId,
                tx
                    .select({ruleId: notificationRuleDestinations.ruleId})
                    .from(notificationRuleDestinations)
                    .where(
                        and(eq(notificationRuleDestinations.integrationId, integrationId), eq(notificationRuleDestinations.handleId, slackHandleId)),
                    ),
            ),
        ),
    );
    await tx
        .update(notificationRuleDestinations)
        .set({handleId: slackHandleId})
        .where(and(eq(notificationRuleDestinations.integrationId, integrationId), eq(notificationRuleDestinations.handleId, webhookHandleId)));
    await tx
        .delete(notificationHandles)
        .where(and(eq(notificationHandles.integrationId, integrationId), eq(notificationHandles.handleId, webhookHandleId)));
};

export const moveWebhookHandles = async (
    params: Scope & {moves: WebhookMove[]},
): Promise<{moved: string[]; failed: string[]; webhookAppEmpty: boolean}> => {
    const {integrationId, integrationIds, moves} = params;

    const slackApp = await withRlsTransaction({
        integrationIds,
        callback: async (tx: RdsTransaction) => {
            const [app] = await tx
                .select({appId: integrationApps.appId})
                .from(integrationApps)
                .where(and(eq(integrationApps.integrationId, integrationId), eq(integrationApps.type, 'slack')));
            return app;
        },
    });
    if (!slackApp) {
        throw new BadRequestError('The Slack app is not installed');
    }

    const botToken = await loadSlackBotToken({integrationId, integrationIds, appId: slackApp.appId});

    const moved: string[] = [];
    const failed: string[] = [];
    for (const {webhookHandleId, channelId} of moves) {
        try {
            // Resolved before the transaction so no row lock is held across the Slack call
            const channel = await getChannel(botToken, channelId);
            if (!channel) {
                throw new BadRequestError('Unknown channel');
            }
            await withRlsTransaction({
                integrationIds,
                userName: gitgazerWriter.name,
                callback: (tx: RdsTransaction) => moveHandle(tx, {integrationId, appId: slackApp.appId, webhookHandleId, channel}),
            });
            moved.push(webhookHandleId);
        } catch (error) {
            getLogger().error('Failed to move webhook handle', {reason: slackErrorReason(error), integrationId, handleId: webhookHandleId});
            failed.push(webhookHandleId);
        }
    }

    const webhookAppEmpty = await withRlsTransaction({
        integrationIds,
        callback: async (tx: RdsTransaction) => {
            const [{count: remaining}] = await tx
                .select({count: count()})
                .from(notificationHandles)
                .innerJoin(
                    integrationApps,
                    and(eq(integrationApps.integrationId, notificationHandles.integrationId), eq(integrationApps.appId, notificationHandles.appId)),
                )
                .where(and(eq(notificationHandles.integrationId, integrationId), eq(integrationApps.type, 'webhook')));
            return Number(remaining) === 0;
        },
    });

    return {moved, failed, webhookAppEmpty};
};
