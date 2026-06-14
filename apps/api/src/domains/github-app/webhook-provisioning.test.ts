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
    githubAppInstallations: Symbol('githubAppInstallations'),
    githubAppWebhooks: Symbol('githubAppWebhooks'),
    integrations: Symbol('integrations'),
}));

const installationUpdateWhere = vi.fn(async () => undefined);
const dbUpdate = vi.fn(() => ({set: () => ({where: installationUpdateWhere})}));
const withRlsTransaction = vi.fn();
vi.mock('@gitgazer/db/client', () => ({
    db: {update: (...a: unknown[]) => dbUpdate(...a)},
    withRlsTransaction: (...a: unknown[]) => withRlsTransaction(...a),
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
