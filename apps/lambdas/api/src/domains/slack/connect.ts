import {findSlackTeamId} from '@/domains/apps/apps.controller';
import {mintSlackState, outcomeRedirect, verifySlackState} from '@/domains/slack/oauth-state';
import {NotFoundError} from '@/shared/errors';
import {checkAccess} from '@/shared/permissions/check-access';
import {buildSignInUrl, exchangeSignInCode, slackErrorReason} from '@gitgazer/backend-core/clients/slack.client';
import {getLogger} from '@gitgazer/backend-core/logger';
import {blockAutoLink, saveSignInLink} from '@gitgazer/backend-services/slack/link-store';
import {db, RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {users} from '@gitgazer/db/schema/gitgazer';
import {isSlackUserId, type MemberRole} from '@gitgazer/db/types';
import {eq} from 'drizzle-orm';

type SignInOutcome = 'connected' | 'workspace_mismatch' | 'failed';

export const buildSlackConnectRedirect = (params: {
    integrationId: string;
    userId: number;
    redirectUrl: string | undefined;
}): {location: string; stateCookie: string} => {
    const {token, nonce, stateCookie} = mintSlackState('slack_sign_in', params);
    return {location: buildSignInUrl(token, nonce), stateCookie};
};

// The GitHub account comes from the GitGazer session, never from the request or from Slack.
const findTeamAndGithubId = async (integrationId: string, integrationIds: string[], userId: number) => {
    const teamId = await withRlsTransaction({integrationIds, callback: (tx: RdsTransaction) => findSlackTeamId(tx, integrationId)});
    const [user] = await db.select({githubId: users.githubId}).from(users).where(eq(users.id, userId));
    return {teamId, githubId: user?.githubId ?? null};
};

const connect = async (params: {code: string; integrationId: string; integrationIds: string[]; userId: number}): Promise<SignInOutcome> => {
    const {code, integrationId, integrationIds, userId} = params;

    const {teamId, githubId} = await findTeamAndGithubId(integrationId, integrationIds, userId);
    if (!teamId || githubId === null) {
        return 'failed';
    }

    const {slackUserId, teamId: signedInTeamId} = await exchangeSignInCode(code);
    if (!isSlackUserId(slackUserId) || !signedInTeamId) {
        getLogger().warn('Slack sign-in returned no user or workspace', {integrationId});
        return 'failed';
    }
    if (signedInTeamId !== teamId) {
        return 'workspace_mismatch';
    }

    await saveSignInLink(teamId, githubId, slackUserId, new Date());
    return 'connected';
};

/**
 * Completes Sign in with Slack. The state is verified before anything else; once it is, every outcome redirects to the
 * frontend URL it carries.
 */
export const completeSlackSignIn = async (params: {
    code: string | undefined;
    state: string | undefined;
    oauthStateNonce: string | null;
    userId: number;
    integrationIds: string[];
    integrationRoles: Record<string, MemberRole>;
}): Promise<{redirectUrl: string}> => {
    const {code, state, oauthStateNonce, userId, integrationIds, integrationRoles} = params;
    const logger = getLogger();

    const {integrationId, redirect_url} = verifySlackState('slack_sign_in', state, oauthStateNonce, userId);

    let outcome: SignInOutcome;
    if (!checkAccess({userId, integrationRoles}, 'slackUser.signInCallback', integrationId).allowed) {
        outcome = 'failed';
    } else if (!code) {
        // Slack returns no code when the user cancels the consent screen
        outcome = 'failed';
    } else {
        try {
            outcome = await connect({code, integrationId, integrationIds, userId});
        } catch (error) {
            logger.error('Slack sign-in failed', {reason: slackErrorReason(error), integrationId});
            outcome = 'failed';
        }
    }

    logger.info(outcome === 'connected' ? 'Slack account connected' : 'Slack sign-in not completed', {integrationId, outcome});
    return outcomeRedirect(redirect_url, outcome, 'connected');
};

/** Removes the caller's own link and keeps automatic lookups from linking them again until they reconnect. */
export const disconnectSlack = async (params: {integrationId: string; integrationIds: string[]; userId: number}): Promise<void> => {
    const {integrationId, integrationIds, userId} = params;

    const {teamId, githubId} = await findTeamAndGithubId(integrationId, integrationIds, userId);
    if (!teamId || githubId === null) {
        throw new NotFoundError('No Slack connection to remove');
    }

    await blockAutoLink(teamId, githubId, new Date());
    getLogger().info('Slack account disconnected', {integrationId});
};
