import {findInstallationId} from '../alerting/log-details';
import {getLink, saveLookupResult, type SlackUserLink} from './link-store';
import {loadWorkspaceForIntegration} from './workspaces';
import {getInstallationOctokit} from '@gitgazer/backend-core/clients/github-app.client';
import {lookupUserByEmail, SlackApiError} from '@gitgazer/backend-core/clients/slack.client';
import {getLogger} from '@gitgazer/backend-core/logger';
import {withRlsTransaction} from '@gitgazer/db/client';
import {users} from '@gitgazer/db/schema/gitgazer';
import {userAssignments} from '@gitgazer/db/schema/github/workflows';
import {eq} from 'drizzle-orm';

export const PROFILE_LINK_REFRESH_MS = 7 * 24 * 3600_000;
export const NOT_FOUND_REFRESH_MS = 24 * 3600_000;
// Runs in the shared webhook worker; a long sweep would time out the batch and send co-batched events to the DLQ.
export const LINK_MEMBERS_BUDGET_MS = 60_000;

/**
 * Finds the Slack user for a GitHub account by its public profile email. Never throws: a failed lookup
 * falls back to the stored link and stores nothing, so a later alert tries again. The email is never kept.
 */
export const resolveSlackUserId = async (params: {
    teamId: string;
    botToken: string;
    integrationId: string;
    githubUserId: number;
    githubLogin: string;
    ownerLogin: string | null;
    now?: Date;
}): Promise<string | null> => {
    const {teamId, botToken, integrationId, githubUserId, githubLogin, ownerLogin, now = new Date()} = params;
    let link: SlackUserLink | null = null;
    try {
        link = await getLink(teamId, githubUserId);
        if (link?.autoLinkBlocked) return link.slackUserId;
        // Sign-in links never refresh automatically; gitgazer_email links refresh at the person's next login.
        if (link?.slackUserId && link.source !== 'github_profile_email') return link.slackUserId;
        const refreshMs = link?.slackUserId ? PROFILE_LINK_REFRESH_MS : NOT_FOUND_REFRESH_MS;
        if (link && now.getTime() - link.checkedAt.getTime() < refreshMs) return link.slackUserId;

        const installationId = await findInstallationId(integrationId, ownerLogin);
        if (installationId === null) return link?.slackUserId ?? null;

        const {data} = await getInstallationOctokit(installationId).request('GET /users/{username}', {username: githubLogin});
        const slackUserId = data.email ? await lookupUserByEmail(botToken, data.email) : null;
        await saveLookupResult({teamId, githubUserId, slackUserId, source: 'github_profile_email', now});
        return slackUserId;
    } catch (error) {
        getLogger().warn('Slack user lookup failed', {
            integrationId,
            reason: error instanceof SlackApiError ? error.code : error instanceof Error ? error.name : 'UnknownError',
        });
        return link?.slackUserId ?? null;
    }
};

/** Runs the send-time lookup once for every member of the integration, right after the Slack app is installed. */
export const linkIntegrationMembers = async (teamId: string, integrationId: string): Promise<{linked: number; checked: number}> => {
    const counts = {linked: 0, checked: 0};
    const startedAt = Date.now();
    const workspace = await loadWorkspaceForIntegration(integrationId);
    // The app may have been removed or reinstalled into another workspace since the task was queued.
    if (!workspace || workspace.disconnected || workspace.teamId !== teamId) {
        getLogger().info('Slack member lookup skipped, workspace not connected', {integrationId});
        return counts;
    }

    const members = await withRlsTransaction({
        integrationIds: [integrationId],
        readOnly: true,
        callback: (tx) =>
            tx
                .select({githubId: users.githubId, githubLogin: users.githubLogin})
                .from(userAssignments)
                .innerJoin(users, eq(users.id, userAssignments.userId))
                .where(eq(userAssignments.integrationId, integrationId)),
    });

    for (const {githubId, githubLogin} of members) {
        if (githubId === null || githubLogin === null) continue;
        if (Date.now() - startedAt >= LINK_MEMBERS_BUDGET_MS) {
            getLogger().warn('Slack member lookup stopped early, budget used up', {integrationId, ...counts});
            return counts;
        }
        const slackUserId = await resolveSlackUserId({
            teamId,
            botToken: workspace.botToken,
            integrationId,
            githubUserId: githubId,
            githubLogin,
            ownerLogin: null,
        });
        counts.checked++;
        if (slackUserId) counts.linked++;
    }

    getLogger().info('Linked integration members to Slack', {integrationId, ...counts});
    return counts;
};
