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
vi.mock('@/shared/clients/github-app.client', () => client);
vi.mock('@/shared/config', () => ({default: {get: () => 'https://example.test/webhooks'}}));
vi.mock('@gitgazer/db/schema/app', () => ({gitgazerWriter: {name: 'gitgazer_writer'}}));
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
const dbInsertValues = vi.fn(async () => undefined);
const dbInsert = vi.fn(() => ({values: dbInsertValues}));
const withRlsTransaction = vi.fn();
vi.mock('@gitgazer/db/client', () => ({
    db: {update: dbUpdate, select: dbSelect, insert: dbInsert},
    withRlsTransaction,
    RdsTransaction: class {},
}));

const WEBHOOKS = [
    {integrationId: 'int-1', installationId: 1, targetType: 'organization', targetName: 'my-org', webhookId: 11, events: ['workflow_run']},
    {integrationId: 'int-1', installationId: 1, targetType: 'repository', targetName: 'my-org/repo', webhookId: 22, events: ['workflow_run']},
];

const mockTx = {
    select: () => ({from: () => ({where: () => WEBHOOKS})}),
    update: () => ({set: () => ({where: async () => undefined})}),
};

let mod: typeof import('./webhook-provisioning');

beforeEach(async () => {
    vi.clearAllMocks();
    // First call (select webhooks) and per-webhook DB updates both run the callback against mockTx.
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
        withRlsTransaction.mockResolvedValueOnce([{secret: 'sek'}]); // integration lookup
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
        expect(dbInsertValues).toHaveBeenCalledTimes(1);
        expect(dbInsertValues).toHaveBeenCalledWith(
            expect.objectContaining({targetType: 'organization', targetName: 'my-org', targetId: 42, webhookId: 99}),
        );
    });

    it('falls back to per-repo webhooks when org webhook creation fails', async () => {
        withRlsTransaction.mockResolvedValueOnce([{secret: 'sek'}]); // integration lookup
        dbSelectWhere.mockResolvedValueOnce([orgInstallation]); // installation lookup
        client.createOrgWebhook.mockRejectedValueOnce(new Error('GitHub 403'));
        client.listInstallationRepos.mockResolvedValueOnce([{id: 7, name: 'repo', fullName: 'my-org/repo', owner: 'my-org', private: false}]);
        client.createRepoWebhook.mockResolvedValueOnce(123);

        const count = await mod.provisionWebhooks('int-1', 1);

        expect(count).toBe(1);
        expect(client.createRepoWebhook).toHaveBeenCalledTimes(1);
        expect(dbInsertValues).toHaveBeenCalledWith(expect.objectContaining({targetType: 'repository', targetName: 'my-org/repo', webhookId: 123}));
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
        withRlsTransaction.mockResolvedValueOnce([{secret: 'sek'}]); // integration lookup
        dbSelectWhere.mockResolvedValueOnce([orgInstallation]); // installation lookup
        withRlsTransaction.mockResolvedValueOnce([{targetType: 'organization', webhookId: 99}]); // org webhook exists

        const count = await mod.provisionWebhooksForRepos('int-1', 1, newRepos);

        expect(count).toBe(0);
        expect(client.createRepoWebhook).not.toHaveBeenCalled();
        expect(dbInsertValues).not.toHaveBeenCalled();
    });

    it('creates per-repo webhooks when no org-level webhook covers the installation', async () => {
        withRlsTransaction.mockResolvedValueOnce([{secret: 'sek'}]); // integration lookup
        dbSelectWhere.mockResolvedValueOnce([orgInstallation]); // installation lookup
        withRlsTransaction.mockResolvedValueOnce([]); // no org webhook
        client.createRepoWebhook.mockResolvedValueOnce(123);

        const count = await mod.provisionWebhooksForRepos('int-1', 1, newRepos);

        expect(count).toBe(1);
        expect(client.createRepoWebhook).toHaveBeenCalledTimes(1);
        expect(dbInsertValues).toHaveBeenCalledWith(expect.objectContaining({targetType: 'repository', targetName: 'my-org/repo', webhookId: 123}));
    });
});
