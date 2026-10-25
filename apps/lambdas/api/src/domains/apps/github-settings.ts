import {db, RdsTransaction} from '@gitgazer/db/client';
import {integrationAppGithubSettings, integrationApps} from '@gitgazer/db/schema/gitgazer';
import type {OrgSyncDefaultRole} from '@gitgazer/db/types';
import {and, eq} from 'drizzle-orm';

export type GithubSettings = {appId: string; secret: string; orgSyncDefaultRole: OrgSyncDefaultRole};

export const getGithubSettings = async (tx: RdsTransaction | typeof db, integrationId: string): Promise<GithubSettings | undefined> => {
    const [settings] = await tx
        .select({
            appId: integrationAppGithubSettings.appId,
            secret: integrationAppGithubSettings.secret,
            orgSyncDefaultRole: integrationAppGithubSettings.orgSyncDefaultRole,
        })
        .from(integrationApps)
        .innerJoin(
            integrationAppGithubSettings,
            and(
                eq(integrationAppGithubSettings.integrationId, integrationApps.integrationId),
                eq(integrationAppGithubSettings.appId, integrationApps.appId),
            ),
        )
        .where(and(eq(integrationApps.integrationId, integrationId), eq(integrationApps.type, 'github')));

    return settings;
};

export const installGithubApp = async (tx: RdsTransaction | typeof db, integrationId: string): Promise<{appId: string}> => {
    const [app] = await tx.insert(integrationApps).values({integrationId, type: 'github'}).returning({appId: integrationApps.appId});
    await tx.insert(integrationAppGithubSettings).values({integrationId, appId: app.appId});
    return {appId: app.appId};
};
