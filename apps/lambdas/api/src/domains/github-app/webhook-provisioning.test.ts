import {beforeEach, describe, expect, it, vi} from 'vitest';

const client = {
    getInstallationOctokit: vi.fn(() => ({})),
    updateOrgWebhookEvents: vi.fn(async () => undefined),
    updateRepoWebhookEvents: vi.fn(async () => undefined),
    updateOrgWebhookSecret: vi.fn(async () => undefined),
    updateRepoWebhookSecret: vi.fn(async () => undefined),
    createOrgWebhook: vi.fn(),
    createRepoWebhook: vi.fn(),
    deleteOrgWebhook: vi.fn(),
    deleteRepoWebhook: vi.fn(),
    listInstallationRepos: vi.fn(),
};
vi.mock('@gitgazer/backend-core/clients/github-app.client', () => client);
vi.mock('@gitgazer/backend-core/config', () => ({default: {get: () => 'https://example.test/webhooks'}}));
vi.mock('@gitgazer/db/schema/app', () => ({gitgazerWriter: {name: 'gitgazer_writer'}}));
const getGithubSettings = vi.fn();
vi.mock('@/domains/apps/github-settings', () => ({getGithubSettings}));
const logger = {debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()};
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => logger}));
vi.mock('@gitgazer/db/schema/github/workflows', () => ({
    githubAppInstallations: {
        installationId: Symbol('installationId'),
        integrationId: Symbol('integrationId'),
    },
    githubAppWebhooks: {
        integrationId: Symbol('integrationId'),
        installationId: Symbol('installationId'),
        webhookId: Symbol('webhookId'),
        targetType: Symbol('targetType'),
    },
    integrations: {
        integrationId: Symbol('integrationId'),
    },
}));

const installationUpdateWhere = vi.fn(async () => undefined);
const dbUpdate = vi.fn(() => ({set: () => ({where: installationUpdateWhere})}));
const dbSelectWhere = vi.fn(async () => [] as unknown[]);
const dbSelect = vi.fn(() => ({from: () => ({where: dbSelectWhere})}));
const withRlsTransaction = vi.fn();
vi.mock('@gitgazer/db/client', () => ({
    db: {update: dbUpdate, select: dbSelect},
    withRlsTransaction,
    RdsTransaction: class {},
}));

const WEBHOOKS = [
    {integrationId: 'int-1', installationId: 1, targetType: 'organization', targetName: 'my-org', webhookId: 11, events: ['workflow_run']},
    {integrationId: 'int-1', installationId: 1, targetType: 'repository', targetName: 'my-org/repo', webhookId: 22, events: ['workflow_run']},
];

const SETTINGS = {appId: 'app-1', secret: 'sek', orgSyncDefaultRole: 'viewer'};

// Webhook rows the tx sees; inserts land here so a later deprovision finds what provisioning recorded.
let storedWebhooks: Record<string, unknown>[] = [];
const installationLock = vi.fn(async () => [{installationId: 1}] as unknown[]);
const txInsertValues = vi.fn(async (row: Record<string, unknown>) => {
    storedWebhooks.push(row);
});

const mockTx = {
    select: () => ({from: () => ({where: () => Object.assign(Promise.resolve(storedWebhooks), {for: installationLock})})}),
    insert: () => ({values: txInsertValues}),
    update: () => ({set: () => ({where: async () => undefined})}),
    delete: () => ({where: async () => undefined}),
};

let mod: typeof import('./webhook-provisioning');

beforeEach(async () => {
    vi.clearAllMocks();
    storedWebhooks = [...WEBHOOKS];
    installationLock.mockResolvedValue([{installationId: 1}]);
    getGithubSettings.mockResolvedValue(SETTINGS);
    // Unqueued calls (webhook selects, per-webhook updates, record steps) run the callback against mockTx.
    withRlsTransaction.mockImplementation(async (p: {callback: (tx: unknown) => unknown}) => p.callback(mockTx));
    mod = await import('./webhook-provisioning');
});

describe('updateAllWebhookEvents', () => {
    it('updates the installation events only when every webhook update succeeds', async () => {
        await mod.updateAllWebhookEvents('int-1', 1, ['workflow_run', 'workflow_job']);

        expect(client.updateOrgWebhookEvents).toHaveBeenCalledTimes(1);
        expect(client.updateRepoWebhookEvents).toHaveBeenCalledTimes(1);
        expect(dbUpdate).toHaveBeenCalledTimes(1); // installation-level write happened
    });

    it('throws and does NOT update installation events when a webhook update fails', async () => {
        client.updateRepoWebhookEvents.mockRejectedValueOnce(new Error('GitHub 404'));

        await expect(mod.updateAllWebhookEvents('int-1', 1, ['workflow_run', 'workflow_job'])).rejects.toThrow(/Failed to update events on 1 of 2/);

        expect(dbUpdate).not.toHaveBeenCalled(); // installation state NOT half-applied
    });
});

describe('updateAllWebhookSecrets', () => {
    it('updates every webhook secret when all updates succeed', async () => {
        await mod.updateAllWebhookSecrets('int-1', 1, 'super-secret');

        expect(client.updateOrgWebhookSecret).toHaveBeenCalledTimes(1);
        expect(client.updateRepoWebhookSecret).toHaveBeenCalledTimes(1);
    });

    it('throws when a webhook secret update fails', async () => {
        client.updateRepoWebhookSecret.mockRejectedValueOnce(new Error('GitHub 404'));

        await expect(mod.updateAllWebhookSecrets('int-1', 1, 'super-secret')).rejects.toThrow(/Failed to update secret on 1 of 2/);

        expect(client.updateOrgWebhookSecret).toHaveBeenCalledTimes(1);
    });
});

describe('provisionWebhooks', () => {
    const orgInstallation = {
        installationId: 1,
        accountType: 'Organization',
        accountLogin: 'my-org',
        accountId: 42,
        repositorySelection: 'all',
        webhookEvents: ['workflow_run'],
    };

    it('creates a single org-level webhook even when the org has no repositories', async () => {
        withRlsTransaction.mockResolvedValueOnce({appId: 'app-1', secret: 'sek', orgSyncDefaultRole: 'viewer'}); // GitHub settings lookup
        dbSelectWhere.mockResolvedValueOnce([orgInstallation]); // installation lookup
        client.createOrgWebhook.mockResolvedValueOnce(99);

        const count = await mod.provisionWebhooks('int-1', 1);

        expect(count).toBe(1);
        expect(client.createOrgWebhook).toHaveBeenCalledTimes(1);
        expect(client.createOrgWebhook).toHaveBeenCalledWith(expect.anything(), 'my-org', 'https://example.test/webhooks/int-1', 'sek', [
            'workflow_run',
        ]);
        // No repo listing or per-repo webhooks for an org-level install.
        expect(client.listInstallationRepos).not.toHaveBeenCalled();
        expect(client.createRepoWebhook).not.toHaveBeenCalled();
        expect(txInsertValues).toHaveBeenCalledTimes(1);
        expect(txInsertValues).toHaveBeenCalledWith(
            expect.objectContaining({targetType: 'organization', targetName: 'my-org', targetId: 42, webhookId: 99}),
        );
    });

    it('falls back to per-repo webhooks when org webhook creation fails', async () => {
        withRlsTransaction.mockResolvedValueOnce({appId: 'app-1', secret: 'sek', orgSyncDefaultRole: 'viewer'}); // GitHub settings lookup
        dbSelectWhere.mockResolvedValueOnce([orgInstallation]); // installation lookup
        client.createOrgWebhook.mockRejectedValueOnce(new Error('GitHub 403'));
        client.listInstallationRepos.mockResolvedValueOnce([{id: 7, name: 'repo', fullName: 'my-org/repo', owner: 'my-org', private: false}]);
        client.createRepoWebhook.mockResolvedValueOnce(123);

        const count = await mod.provisionWebhooks('int-1', 1);

        expect(count).toBe(1);
        expect(client.createRepoWebhook).toHaveBeenCalledTimes(1);
        expect(txInsertValues).toHaveBeenCalledWith(expect.objectContaining({targetType: 'repository', targetName: 'my-org/repo', webhookId: 123}));
    });
});

describe('provisionWebhooks without a GitHub app', () => {
    it('throws when the integration has no GitHub app', async () => {
        withRlsTransaction.mockResolvedValueOnce(undefined); // GitHub settings lookup

        await expect(mod.provisionWebhooks('int-1', 1)).rejects.toThrow('Integration int-1 has no GitHub app');
        expect(client.createOrgWebhook).not.toHaveBeenCalled();
    });
});

describe('provisionWebhooksForRepos', () => {
    const orgInstallation = {
        installationId: 1,
        accountType: 'Organization',
        accountLogin: 'my-org',
        accountId: 42,
        repositorySelection: 'all',
        webhookEvents: ['workflow_run'],
    };
    const newRepos = [{id: 7, name: 'repo', fullName: 'my-org/repo', owner: 'my-org', private: false}];

    it('skips per-repo provisioning when an org-level webhook already covers the installation', async () => {
        withRlsTransaction.mockResolvedValueOnce({appId: 'app-1', secret: 'sek', orgSyncDefaultRole: 'viewer'}); // GitHub settings lookup
        dbSelectWhere.mockResolvedValueOnce([orgInstallation]); // installation lookup
        withRlsTransaction.mockResolvedValueOnce([{targetType: 'organization', webhookId: 99}]); // org webhook exists

        const count = await mod.provisionWebhooksForRepos('int-1', 1, newRepos);

        expect(count).toBe(0);
        expect(client.createRepoWebhook).not.toHaveBeenCalled();
        expect(txInsertValues).not.toHaveBeenCalled();
    });

    it('creates per-repo webhooks when no org-level webhook covers the installation', async () => {
        withRlsTransaction.mockResolvedValueOnce({appId: 'app-1', secret: 'sek', orgSyncDefaultRole: 'viewer'}); // GitHub settings lookup
        dbSelectWhere.mockResolvedValueOnce([orgInstallation]); // installation lookup
        withRlsTransaction.mockResolvedValueOnce([]); // no org webhook
        client.createRepoWebhook.mockResolvedValueOnce(123);

        const count = await mod.provisionWebhooksForRepos('int-1', 1, newRepos);

        expect(count).toBe(1);
        expect(client.createRepoWebhook).toHaveBeenCalledTimes(1);
        expect(txInsertValues).toHaveBeenCalledWith(expect.objectContaining({targetType: 'repository', targetName: 'my-org/repo', webhookId: 123}));
    });
});

describe('provisioning racing an installation unlink', () => {
    const orgInstallation = {
        installationId: 1,
        accountType: 'Organization',
        accountLogin: 'my-org',
        accountId: 42,
        repositorySelection: 'all',
        webhookEvents: ['workflow_run'],
    };
    const newRepos = [{id: 7, name: 'repo', fullName: 'my-org/repo', owner: 'my-org', private: false}];

    beforeEach(() => {
        storedWebhooks = [];
    });

    it('re-checks the link under share locks only after GitHub created the webhook', async () => {
        withRlsTransaction.mockResolvedValueOnce(SETTINGS); // GitHub settings lookup
        dbSelectWhere.mockResolvedValueOnce([orgInstallation]);
        client.createOrgWebhook.mockResolvedValueOnce(99);

        await mod.provisionWebhooks('int-1', 1);

        expect(withRlsTransaction).toHaveBeenLastCalledWith(expect.objectContaining({integrationIds: ['int-1'], userName: 'gitgazer_writer'}));
        expect(installationLock).toHaveBeenCalledWith('share');
        expect(getGithubSettings).toHaveBeenCalledWith(mockTx, 'int-1', 'share');
        expect(client.createOrgWebhook.mock.invocationCallOrder[0]).toBeLessThan(installationLock.mock.invocationCallOrder[0]);
        expect(installationLock.mock.invocationCallOrder[0]).toBeLessThan(txInsertValues.mock.invocationCallOrder[0]);
    });

    it('deletes the org webhook it just created and records nothing when the unlink committed first', async () => {
        withRlsTransaction.mockResolvedValueOnce(SETTINGS); // GitHub settings lookup
        dbSelectWhere.mockResolvedValueOnce([orgInstallation]);
        client.createOrgWebhook.mockResolvedValueOnce(99);
        installationLock.mockResolvedValueOnce([]); // unlink's UPDATE committed before the record step

        const count = await mod.provisionWebhooks('int-1', 1);

        expect(count).toBe(0);
        expect(txInsertValues).not.toHaveBeenCalled();
        expect(client.deleteOrgWebhook).toHaveBeenCalledWith(expect.anything(), 'my-org', 99);
        // Unlinked is not a GitHub failure, so no per-repo fallback
        expect(client.listInstallationRepos).not.toHaveBeenCalled();
        expect(client.createRepoWebhook).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({integrationId: 'int-1', installationId: 1, webhookId: 99, targetName: 'my-org'}),
        );
    });

    it('deletes the repo webhook it just created when the installation was unlinked during provisioning', async () => {
        withRlsTransaction.mockResolvedValueOnce(SETTINGS); // GitHub settings lookup
        dbSelectWhere.mockResolvedValueOnce([orgInstallation]);
        withRlsTransaction.mockResolvedValueOnce([]); // no org webhook
        client.createRepoWebhook.mockResolvedValueOnce(123);
        installationLock.mockResolvedValueOnce([]);

        const count = await mod.provisionWebhooksForRepos('int-1', 1, newRepos);

        expect(count).toBe(0);
        expect(txInsertValues).not.toHaveBeenCalled();
        expect(client.deleteRepoWebhook).toHaveBeenCalledWith(expect.anything(), 'my-org', 'repo', 123);
    });

    it('deletes the webhook it just created when the GitHub app was removed during provisioning', async () => {
        withRlsTransaction.mockResolvedValueOnce(SETTINGS); // GitHub settings lookup
        dbSelectWhere.mockResolvedValueOnce([orgInstallation]);
        client.createOrgWebhook.mockResolvedValueOnce(99);
        getGithubSettings.mockResolvedValueOnce(undefined);

        await expect(mod.provisionWebhooks('int-1', 1)).resolves.toBe(0);

        expect(txInsertValues).not.toHaveBeenCalled();
        expect(client.deleteOrgWebhook).toHaveBeenCalledWith(expect.anything(), 'my-org', 99);
    });

    it('logs and does not throw when deleting the orphaned webhook fails', async () => {
        withRlsTransaction.mockResolvedValueOnce(SETTINGS); // GitHub settings lookup
        dbSelectWhere.mockResolvedValueOnce([orgInstallation]);
        client.createOrgWebhook.mockResolvedValueOnce(99);
        installationLock.mockResolvedValueOnce([]);
        client.deleteOrgWebhook.mockRejectedValueOnce(new Error('GitHub 502'));

        await expect(mod.provisionWebhooks('int-1', 1)).resolves.toBe(0);

        expect(logger.error).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({integrationId: 'int-1', installationId: 1, webhookId: 99, error: expect.any(Error)}),
        );
    });

    it('lets a later unlink deprovision a webhook recorded before the unlink committed', async () => {
        withRlsTransaction.mockResolvedValueOnce(SETTINGS); // GitHub settings lookup
        dbSelectWhere.mockResolvedValueOnce([orgInstallation]);
        client.createOrgWebhook.mockResolvedValueOnce(99);

        await expect(mod.provisionWebhooks('int-1', 1)).resolves.toBe(1);
        expect(client.deleteOrgWebhook).not.toHaveBeenCalled();

        await mod.deprovisionAllWebhooks('int-1', 1);

        expect(client.deleteOrgWebhook).toHaveBeenCalledWith(expect.anything(), 'my-org', 99);
    });
});
