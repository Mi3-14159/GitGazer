import {db} from '@gitgazer/db/client';
import {slackUserLinks} from '@gitgazer/db/schema/gitgazer';
import type {SlackLinkSource} from '@gitgazer/db/types';
import {and, eq, sql, type SQL} from 'drizzle-orm';

export type SlackUserLink = {slackUserId: string | null; source: SlackLinkSource | null; checkedAt: Date; autoLinkBlocked: boolean};

type LinkValues = Omit<SlackUserLink, 'autoLinkBlocked'> & {autoLinkBlocked?: boolean};

const upsertLink = async (teamId: string, githubUserId: number, values: LinkValues, setWhere?: SQL): Promise<void> => {
    await db
        .insert(slackUserLinks)
        .values({teamId, githubUserId, ...values})
        .onConflictDoUpdate({target: [slackUserLinks.teamId, slackUserLinks.githubUserId], set: values, setWhere});
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
    // One atomic statement, so a concurrent Slack sign-in or disconnect can never be overwritten.
    const replaceable = sql`not ${slackUserLinks.autoLinkBlocked} and ${slackUserLinks.source} is distinct from 'slack_sign_in'`;
    // A miss must not erase a match another source still vouches for.
    const setWhere = slackUserId
        ? replaceable
        : sql`${replaceable} and (${slackUserLinks.slackUserId} is null or ${slackUserLinks.source} = ${source})`;

    await upsertLink(teamId, githubUserId, {slackUserId, source: slackUserId ? source : null, checkedAt: now}, setWhere);
};

export const saveSignInLink = async (teamId: string, githubUserId: number, slackUserId: string, now: Date): Promise<void> => {
    await upsertLink(teamId, githubUserId, {slackUserId, source: 'slack_sign_in', autoLinkBlocked: false, checkedAt: now});
};

export const blockAutoLink = async (teamId: string, githubUserId: number, now: Date): Promise<void> => {
    await upsertLink(teamId, githubUserId, {slackUserId: null, source: null, autoLinkBlocked: true, checkedAt: now});
};
