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
const inArray = vi.hoisted(() => vi.fn());
vi.mock('drizzle-orm', async (importOriginal) => {
    const actual = await importOriginal<typeof import('drizzle-orm')>();
    inArray.mockImplementation(actual.inArray as never);
    return {...actual, inArray};
});
vi.mock('@gitgazer/db/schema/app', () => ({gitgazerWriter: {name: 'gitgazer_writer'}}));
const getGithubSettings = vi.fn();
vi.mock('./github-settings', () => ({getGithubSettings}));
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

describe('updateWebhookSecrets', () => {
    it('updates exactly the given webhooks without re-reading the recorded ones', async () => {
        storedWebhooks.push({...WEBHOOKS[0], webhookId: 99, targetName: 'replacement-org'});

        await mod.updateWebhookSecrets('int-1', 1, WEBHOOKS, 'super-secret');

        expect(withRlsTransaction).not.toHaveBeenCalled();
        expect(client.updateOrgWebhookSecret).toHaveBeenCalledTimes(1);
        expect(client.updateOrgWebhookSecret).toHaveBeenCalledWith(expect.anything(), 'my-org', 11, expect.any(String), 'super-secret');
        expect(client.updateRepoWebhookSecret).toHaveBeenCalledTimes(1);
    });

    it('throws when a webhook secret update fails', async () => {
        client.updateRepoWebhookSecret.mockRejectedValueOnce(new Error('GitHub 404'));

        await expect(mod.updateWebhookSecrets('int-1', 1, WEBHOOKS, 'super-secret')).rejects.toThrow(/Failed to update secret on 1 of 2/);

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
            expect.objectContaining({integrationId: 'int-1', installationId: 1, webhookId: 99, targetName: 'my-org', reason: 'unlinked'}),
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
        expect(logger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({webhookId: 99, reason: 'app removed'}));
    });

    it('deletes the webhook it just created when the GitHub app was reinstalled during provisioning', async () => {
        withRlsTransaction.mockResolvedValueOnce(SETTINGS); // GitHub settings lookup
        dbSelectWhere.mockResolvedValueOnce([orgInstallation]);
        client.createOrgWebhook.mockResolvedValueOnce(99);
        // Removed, reinstalled and relinked meanwhile: same installation, new app and secret
        getGithubSettings.mockResolvedValueOnce({...SETTINGS, appId: 'app-2', secret: 'new-sek'});

        await expect(mod.provisionWebhooks('int-1', 1)).resolves.toBe(0);

        expect(txInsertValues).not.toHaveBeenCalled();
        expect(client.deleteOrgWebhook).toHaveBeenCalledWith(expect.anything(), 'my-org', 99);
        expect(client.listInstallationRepos).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({integrationId: 'int-1', installationId: 1, webhookId: 99, reason: 'app replaced'}),
        );
        expect(JSON.stringify(logger.warn.mock.calls)).not.toMatch(/sek/);
    });

    it('deletes the webhook it just created when the secret was rotated during provisioning', async () => {
        withRlsTransaction.mockResolvedValueOnce(SETTINGS); // GitHub settings lookup
        dbSelectWhere.mockResolvedValueOnce([orgInstallation]);
        withRlsTransaction.mockResolvedValueOnce([]); // no org webhook
        client.createRepoWebhook.mockResolvedValueOnce(123);
        getGithubSettings.mockResolvedValueOnce({...SETTINGS, secret: 'rotated-sek'});

        await expect(mod.provisionWebhooksForRepos('int-1', 1, newRepos)).resolves.toBe(0);

        expect(client.createRepoWebhook).toHaveBeenCalledWith(expect.anything(), 'my-org', 'repo', expect.any(String), 'sek', ['workflow_run']);
        expect(txInsertValues).not.toHaveBeenCalled();
        expect(client.deleteRepoWebhook).toHaveBeenCalledWith(expect.anything(), 'my-org', 'repo', 123);
        expect(logger.warn).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({integrationId: 'int-1', installationId: 1, webhookId: 123, reason: 'secret rotated'}),
        );
        expect(JSON.stringify(logger.warn.mock.calls)).not.toMatch(/sek/);
    });

    it('records the webhook when the app id and secret it was created with are still current', async () => {
        withRlsTransaction.mockResolvedValueOnce(SETTINGS); // GitHub settings lookup
        dbSelectWhere.mockResolvedValueOnce([orgInstallation]);
        withRlsTransaction.mockResolvedValueOnce([]); // no org webhook
        client.createRepoWebhook.mockResolvedValueOnce(123);
        getGithubSettings.mockResolvedValueOnce({...SETTINGS});

        await expect(mod.provisionWebhooksForRepos('int-1', 1, newRepos)).resolves.toBe(1);

        expect(txInsertValues).toHaveBeenCalledWith(expect.objectContaining({webhookId: 123}));
        expect(client.deleteRepoWebhook).not.toHaveBeenCalled();
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

        // unlinkInstallation passes the rows it read right after detaching
        await mod.deprovisionWebhooks('int-1', 1, [...storedWebhooks] as never);

        expect(client.deleteOrgWebhook).toHaveBeenCalledWith(expect.anything(), 'my-org', 99);
    });

    it('deletes the org webhook it just created when recording it throws, then falls back as before', async () => {
        withRlsTransaction.mockResolvedValueOnce(SETTINGS); // GitHub settings lookup
        dbSelectWhere.mockResolvedValueOnce([orgInstallation]);
        client.createOrgWebhook.mockResolvedValueOnce(99);
        installationLock.mockRejectedValueOnce(new Error('lock timeout'));
        client.listInstallationRepos.mockResolvedValueOnce([]);

        await expect(mod.provisionWebhooks('int-1', 1)).resolves.toBe(0);

        expect(client.deleteOrgWebhook).toHaveBeenCalledWith(expect.anything(), 'my-org', 99);
        expect(client.listInstallationRepos).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({webhookId: 99, reason: 'record failed'}));
    });

    it('deletes the repo webhook it just created when recording it throws', async () => {
        withRlsTransaction.mockResolvedValueOnce(SETTINGS); // GitHub settings lookup
        dbSelectWhere.mockResolvedValueOnce([orgInstallation]);
        withRlsTransaction.mockResolvedValueOnce([]); // no org webhook
        client.createRepoWebhook.mockResolvedValueOnce(123);
        installationLock.mockRejectedValueOnce(new Error('connection reset'));

        await expect(mod.provisionWebhooksForRepos('int-1', 1, newRepos)).resolves.toBe(0);

        expect(txInsertValues).not.toHaveBeenCalled();
        expect(client.deleteRepoWebhook).toHaveBeenCalledWith(expect.anything(), 'my-org', 'repo', 123);
        expect(logger.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({error: expect.any(Error)}));
    });
});

describe('deprovisionWebhooks', () => {
    it('leaves the webhooks a re-link recorded during deprovisioning untouched', async () => {
        const oldLink = {integrationId: 'int-1', installationId: 1, targetType: 'organization', targetName: 'my-org', webhookId: 99};
        const newLink = {integrationId: 'int-1', installationId: 1, targetType: 'repository', targetName: 'my-org/repo', webhookId: 123};
        storedWebhooks = [oldLink, newLink];

        await mod.deprovisionWebhooks('int-1', 1, [oldLink] as never);

        expect(client.deleteOrgWebhook).toHaveBeenCalledWith(expect.anything(), 'my-org', 99);
        expect(client.deleteRepoWebhook).not.toHaveBeenCalled();
        expect(inArray).toHaveBeenCalledWith(expect.anything(), [99]);
    });

    it('touches neither GitHub nor the database when nothing was recorded', async () => {
        await mod.deprovisionWebhooks('int-1', 1, []);

        expect(client.getInstallationOctokit).not.toHaveBeenCalled();
        expect(withRlsTransaction).not.toHaveBeenCalled();
    });
});
