import {findSlackTeamId, logAppInstalled, releaseWorkspaceIfUnused} from '@/domains/apps/apps.controller';
import {mintSignedState, verifySignedState} from '@/domains/auth/auth.controller';
import {validateRedirectUrl} from '@/domains/auth/auth.helpers';
import {buildStateCookie} from '@/shared/helpers/cookies';
import {BadRequestError, ForbiddenError} from '@aws-lambda-powertools/event-handler/http';
import {buildInstallUrl, exchangeInstallCode, revokeToken, slackErrorReason} from '@gitgazer/backend-core/clients/slack.client';
import {sendSlackLookupTask} from '@gitgazer/backend-core/clients/sqs.client';
import config from '@gitgazer/backend-core/config';
import {encryptToken} from '@gitgazer/backend-core/helpers/token-crypto';
import {getLogger} from '@gitgazer/backend-core/logger';
import {db, RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {gitgazerWriter} from '@gitgazer/db/schema/app';
import {integrationAppSlackSettings, integrationApps, slackWorkspaces} from '@gitgazer/db/schema/gitgazer';
import {hasRole, type MemberRole} from '@gitgazer/db/types';
import {eq} from 'drizzle-orm';

export type SlackState = {purpose: 'slack_install' | 'slack_sign_in'; integrationId: string; userId: number; redirect_url: string};

type InstallOutcome = 'installed' | 'enterprise' | 'workspace_mismatch' | 'failed';

/** Mints the state for a Slack round trip, bound to the user, the integration and an allow-listed frontend URL. */
export const mintSlackState = (
    purpose: SlackState['purpose'],
    params: {integrationId: string; userId: number; redirectUrl: string | undefined},
): {token: string; nonce: string; stateCookie: string} => {
    const redirectUrl = params.redirectUrl && validateRedirectUrl(params.redirectUrl);
    if (!redirectUrl) {
        throw new BadRequestError('Invalid redirect_url parameter');
    }

    const {token, nonce} = mintSignedState<SlackState>({
        purpose,
        integrationId: params.integrationId,
        userId: params.userId,
        redirect_url: redirectUrl,
    });
    return {token, nonce, stateCookie: buildStateCookie(nonce)};
};

export const verifySlackState = (purpose: SlackState['purpose'], state: string | undefined, nonce: string | null, userId: number): SlackState => {
    const verified = verifySignedState<SlackState>(state, nonce);
    if (!verified || verified.purpose !== purpose || verified.userId !== userId) {
        throw new ForbiddenError('Invalid or expired OAuth state');
    }
    return verified;
};

export const outcomeRedirect = (redirect_url: string, outcome: string, success: string): {redirectUrl: string} => {
    const redirectUrl = new URL(redirect_url);
    redirectUrl.searchParams.set(outcome === success ? 'slack' : 'slack_error', outcome);
    return {redirectUrl: redirectUrl.toString()};
};

export const buildSlackInstallRedirect = (params: {
    integrationId: string;
    userId: number;
    redirectUrl: string | undefined;
}): {location: string; stateCookie: string} => {
    const {token, stateCookie} = mintSlackState('slack_install', params);
    return {location: buildInstallUrl(token), stateCookie};
};

const revokeUnusedToken = async (botToken: string, integrationId: string): Promise<void> => {
    try {
        await revokeToken(botToken);
    } catch (error) {
        getLogger().error('Failed to revoke an unused Slack token', {reason: slackErrorReason(error), integrationId});
    }
};

const install = async (params: {code: string; integrationId: string; userId: number; integrationIds: string[]}): Promise<InstallOutcome> => {
    const {code, integrationId, userId, integrationIds} = params;
    const logger = getLogger();

    const installation = await exchangeInstallCode(code);
    if (installation.isEnterpriseInstall) {
        await revokeUnusedToken(installation.botToken, integrationId);
        return 'enterprise';
    }

    const {teamId} = installation;
    const currentTeamId = await withRlsTransaction({integrationIds, callback: (tx: RdsTransaction) => findSlackTeamId(tx, integrationId)});
    if (currentTeamId && currentTeamId !== teamId) {
        // A workspace GitGazer already holds got its stored bot token back; revoking it would cut off every integration on it
        const [stored] = await db.select({teamId: slackWorkspaces.teamId}).from(slackWorkspaces).where(eq(slackWorkspaces.teamId, teamId));
        if (!stored) {
            await revokeUnusedToken(installation.botToken, integrationId);
        }
        return 'workspace_mismatch';
    }

    const workspace = {
        teamName: installation.teamName,
        botUserId: installation.botUserId,
        botTokenCiphertext: await encryptToken(installation.botToken),
        installedBy: userId,
        installedAt: new Date(),
        disconnectedAt: null,
    };
    await db
        .insert(slackWorkspaces)
        .values({teamId, ...workspace})
        .onConflictDoUpdate({target: slackWorkspaces.teamId, set: workspace});

    // An app already on this workspace is a reinstall, which only refreshes the workspace's token
    if (!currentTeamId) {
        try {
            await withRlsTransaction({
                integrationIds,
                userName: gitgazerWriter.name,
                callback: async (tx: RdsTransaction) => {
                    const [app] = await tx.insert(integrationApps).values({integrationId, type: 'slack'}).returning({appId: integrationApps.appId});
                    await tx.insert(integrationAppSlackSettings).values({integrationId, appId: app.appId, teamId});
                },
            });
        } catch (error) {
            await releaseWorkspaceIfUnused(integrationId, teamId);
            throw error;
        }
        await logAppInstalled(integrationId, 'slack');
    }

    try {
        await sendSlackLookupTask(config.get('webhookQueueUrl'), {taskType: 'slack_lookup', teamId, integrationId});
    } catch (error) {
        logger.error('Failed to queue the Slack member lookup', {error, integrationId});
    }

    logger.info('Slack app installed', {integrationId, reinstall: Boolean(currentTeamId)});
    return 'installed';
};

/**
 * Completes the Slack OAuth install. The state is verified before anything else; once it is, every outcome redirects
 * to the frontend URL it carries.
 */
export const completeSlackInstall = async (params: {
    code: string | undefined;
    state: string | undefined;
    oauthStateNonce: string | null;
    userId: number;
    integrationIds: string[];
    integrationRoles: Record<string, MemberRole>;
}): Promise<{redirectUrl: string}> => {
    const {code, state, oauthStateNonce, userId, integrationIds, integrationRoles} = params;
    const logger = getLogger();

    const {integrationId, redirect_url} = verifySlackState('slack_install', state, oauthStateNonce, userId);

    let outcome: InstallOutcome;
    const role = integrationRoles[integrationId];
    if (!role || !hasRole(role, 'admin')) {
        logger.warn('Slack install rejected: user is no longer an admin', {integrationId, userId});
        outcome = 'failed';
    } else if (!code) {
        // Slack returns no code when the user cancels the consent screen
        outcome = 'failed';
    } else {
        try {
            outcome = await install({code, integrationId, userId, integrationIds});
        } catch (error) {
            logger.error('Slack install failed', {reason: slackErrorReason(error), integrationId});
            outcome = 'failed';
        }
    }

    if (outcome !== 'installed') {
        logger.info('Slack install not completed', {integrationId, outcome});
    }

    return outcomeRedirect(redirect_url, outcome, 'installed');
};
