import {describe, expect, it, vi} from 'vitest';

vi.mock('@gitgazer/db/client', () => ({db: {}, RdsTransaction: {}}));

describe('github settings', () => {
    it('getGithubSettings returns the settings of the GitHub app', async () => {
        const {getGithubSettings} = await import('./github-settings');
        const row = {appId: 'app-1', secret: 'shh', orgSyncDefaultRole: 'viewer'};
        const tx = {select: () => ({from: () => ({innerJoin: () => ({where: () => Promise.resolve([row])})})})};

        await expect(getGithubSettings(tx as any, 'int-1')).resolves.toEqual(row);
    });

    it('getGithubSettings returns undefined without a GitHub app', async () => {
        const {getGithubSettings} = await import('./github-settings');
        const tx = {select: () => ({from: () => ({innerJoin: () => ({where: () => Promise.resolve([])})})})};

        await expect(getGithubSettings(tx as any, 'int-1')).resolves.toBeUndefined();
    });

    it('getGithubSettings locks only the settings row when asked to', async () => {
        const {getGithubSettings} = await import('./github-settings');
        const schema = await import('@gitgazer/db/schema/gitgazer');
        const row = {appId: 'app-1', secret: 'shh', orgSyncDefaultRole: 'viewer'};
        const lock = vi.fn(() => Promise.resolve([row]));
        const tx = {select: () => ({from: () => ({innerJoin: () => ({where: () => ({for: lock})})})})};

        await expect(getGithubSettings(tx as any, 'int-1', 'share')).resolves.toEqual(row);
        expect(lock).toHaveBeenCalledWith('share', {of: schema.integrationAppGithubSettings});
    });

    it('installGithubApp inserts the app and its settings', async () => {
        const {installGithubApp} = await import('./github-settings');
        const schema = await import('@gitgazer/db/schema/gitgazer');
        const inserts: {table: unknown; values: unknown}[] = [];
        const tx = {
            insert: (table: unknown) => ({
                values: (values: unknown) => {
                    inserts.push({table, values});
                    return {returning: () => Promise.resolve([{appId: 'app-1'}])};
                },
            }),
        };

        await expect(installGithubApp(tx as any, 'int-1')).resolves.toEqual({appId: 'app-1'});
        expect(inserts).toEqual([
            {table: schema.integrationApps, values: {integrationId: 'int-1', type: 'github'}},
            {table: schema.integrationAppGithubSettings, values: {integrationId: 'int-1', appId: 'app-1'}},
        ]);
    });
});
