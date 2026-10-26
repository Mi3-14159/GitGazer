import {db} from '@gitgazer/db/client';
import {slackUserLinks} from '@gitgazer/db/schema/gitgazer';
import type {SlackLinkSource} from '@gitgazer/db/types';
import {and, eq} from 'drizzle-orm';

export type SlackUserLink = {slackUserId: string | null; source: SlackLinkSource | null; checkedAt: Date; autoLinkBlocked: boolean};

type LinkValues = Omit<SlackUserLink, 'autoLinkBlocked'> & {autoLinkBlocked?: boolean};

const upsertLink = async (teamId: string, githubUserId: number, values: LinkValues): Promise<void> => {
    await db
        .insert(slackUserLinks)
        .values({teamId, githubUserId, ...values})
        .onConflictDoUpdate({target: [slackUserLinks.teamId, slackUserLinks.githubUserId], set: values});
};

export const getLink = async (teamId: string, githubUserId: number): Promise<SlackUserLink | null> => {
    const [link] = await db
        .select({
            slackUserId: slackUserLinks.slackUserId,
            source: slackUserLinks.source,
            checkedAt: slackUserLinks.checkedAt,
            autoLinkBlocked: slackUserLinks.autoLinkBlocked,
        })
        .from(slackUserLinks)
        .where(and(eq(slackUserLinks.teamId, teamId), eq(slackUserLinks.githubUserId, githubUserId)));
    return link ?? null;
};

/** Stores an automatic lookup result; a "not found" (`slackUserId: null`) is stored without a source. */
export const saveLookupResult = async (params: {
    teamId: string;
    githubUserId: number;
    slackUserId: string | null;
    source: 'gitgazer_email' | 'github_profile_email';
    now: Date;
}): Promise<void> => {
    const {teamId, githubUserId, slackUserId, source, now} = params;
    const existing = await getLink(teamId, githubUserId);
    if (existing?.autoLinkBlocked || existing?.source === 'slack_sign_in') return;
    // A miss must not erase a match another source still vouches for.
    if (!slackUserId && existing?.slackUserId && existing.source !== source) return;

    await upsertLink(teamId, githubUserId, {slackUserId, source: slackUserId ? source : null, checkedAt: now});
};

export const saveSignInLink = async (teamId: string, githubUserId: number, slackUserId: string, now: Date): Promise<void> => {
    await upsertLink(teamId, githubUserId, {slackUserId, source: 'slack_sign_in', autoLinkBlocked: false, checkedAt: now});
};

export const blockAutoLink = async (teamId: string, githubUserId: number, now: Date): Promise<void> => {
    await upsertLink(teamId, githubUserId, {slackUserId: null, source: null, autoLinkBlocked: true, checkedAt: now});
};
