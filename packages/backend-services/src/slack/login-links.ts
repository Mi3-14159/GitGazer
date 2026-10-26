import {saveLookupResult} from './link-store';
import {lookupUserByEmail} from '@gitgazer/backend-core/clients/slack.client';
import {TimeoutError, withTimeout} from '@gitgazer/backend-core/helpers/async';
import {decryptToken} from '@gitgazer/backend-core/helpers/token-crypto';
import {getLogger} from '@gitgazer/backend-core/logger';
import {db} from '@gitgazer/db/client';
import {integrationAppSlackSettings, slackUserLinks, slackWorkspaces, users} from '@gitgazer/db/schema/gitgazer';
import {userAssignments} from '@gitgazer/db/schema/github/workflows';
import {and, eq, isNull} from 'drizzle-orm';

export const LOGIN_LOOKUP_BUDGET_MS = 2000;

/**
 * Links the user to their Slack account in every connected workspace of their integrations, by their verified emails.
 * Runs inside the login request, so it is time-boxed and never throws; whatever does not finish is retried next login.
 */
export const linkAtLogin = async (githubUserId: number, emails: string[]): Promise<void> => {
    if (emails.length === 0) return;

    const logger = getLogger();
    const counts = {workspaces: 0, linked: 0, notFound: 0, failed: 0};
    let budgetExpired = false;

    const linkWorkspace = async (teamId: string, botTokenCiphertext: string) => {
        try {
            const token = await decryptToken(botTokenCiphertext);
            let slackUserId: string | null = null;
            for (const email of emails) {
                slackUserId = await lookupUserByEmail(token, email);
                if (slackUserId) break;
            }
            // The login response may already be sent; a late write could land after a newer login's result.
            if (budgetExpired) return;
            await saveLookupResult({teamId, githubUserId, slackUserId, source: 'gitgazer_email', now: new Date()});
            counts[slackUserId ? 'linked' : 'notFound']++;
        } catch {
            counts.failed++;
        }
    };

    const linkAll = async () => {
        const workspaces = await db
            .selectDistinct({
                teamId: slackWorkspaces.teamId,
                botTokenCiphertext: slackWorkspaces.botTokenCiphertext,
                source: slackUserLinks.source,
                autoLinkBlocked: slackUserLinks.autoLinkBlocked,
            })
            .from(users)
            .innerJoin(userAssignments, eq(userAssignments.userId, users.id))
            .innerJoin(integrationAppSlackSettings, eq(integrationAppSlackSettings.integrationId, userAssignments.integrationId))
            .innerJoin(slackWorkspaces, eq(slackWorkspaces.teamId, integrationAppSlackSettings.teamId))
            .leftJoin(slackUserLinks, and(eq(slackUserLinks.teamId, slackWorkspaces.teamId), eq(slackUserLinks.githubUserId, githubUserId)))
            .where(and(eq(users.githubId, githubUserId), isNull(slackWorkspaces.disconnectedAt)));

        const linkable = workspaces.filter((w) => !w.autoLinkBlocked && w.source !== 'slack_sign_in');
        counts.workspaces = linkable.length;
        await Promise.all(linkable.map((w) => linkWorkspace(w.teamId, w.botTokenCiphertext)));
    };

    try {
        await withTimeout(linkAll(), LOGIN_LOOKUP_BUDGET_MS);
        logger.info('Linked Slack users at login', counts);
    } catch (error) {
        if (error instanceof TimeoutError) budgetExpired = true;
        logger.warn('Slack linking at login did not finish', {...counts, timedOut: budgetExpired});
    }
};
