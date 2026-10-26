import {decryptToken} from '@gitgazer/backend-core/helpers/token-crypto';
import {db, withRlsTransaction} from '@gitgazer/db/client';
import {integrationAppSlackSettings, slackWorkspaces} from '@gitgazer/db/schema/gitgazer';
import {and, eq, isNull} from 'drizzle-orm';

export const loadWorkspaceForIntegration = async (
    integrationId: string,
): Promise<{teamId: string; botToken: string; disconnected: boolean} | null> => {
    const [settings] = await withRlsTransaction({
        integrationIds: [integrationId],
        readOnly: true,
        callback: (tx) =>
            tx
                .select({teamId: integrationAppSlackSettings.teamId})
                .from(integrationAppSlackSettings)
                .where(eq(integrationAppSlackSettings.integrationId, integrationId)),
    });
    if (!settings) return null;

    const [workspace] = await db
        .select({botTokenCiphertext: slackWorkspaces.botTokenCiphertext, disconnectedAt: slackWorkspaces.disconnectedAt})
        .from(slackWorkspaces)
        .where(eq(slackWorkspaces.teamId, settings.teamId));
    if (!workspace) return null;
    if (workspace.disconnectedAt !== null) return {teamId: settings.teamId, botToken: '', disconnected: true};

    return {teamId: settings.teamId, botToken: await decryptToken(workspace.botTokenCiphertext), disconnected: false};
};

/** Returns the integrations using the workspace, but only to the caller that actually disconnected it. */
export const markWorkspaceDisconnected = async (teamId: string): Promise<string[]> => {
    const transitioned = await db
        .update(slackWorkspaces)
        .set({disconnectedAt: new Date()})
        .where(and(eq(slackWorkspaces.teamId, teamId), isNull(slackWorkspaces.disconnectedAt)))
        .returning({teamId: slackWorkspaces.teamId});
    if (transitioned.length === 0) return [];

    const settings = await db
        .select({integrationId: integrationAppSlackSettings.integrationId})
        .from(integrationAppSlackSettings)
        .where(eq(integrationAppSlackSettings.teamId, teamId));
    return settings.map((s) => s.integrationId);
};
