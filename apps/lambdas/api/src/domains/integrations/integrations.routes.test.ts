import router from '@/domains/integrations/integrations.routes';
import {testRequest} from '@/shared/hono/test-request';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => {
    const where = vi.fn();
    const select = vi.fn(() => ({from: () => ({where})}));
    const returning = vi.fn();
    const update = vi.fn(() => ({set: () => ({where: () => ({returning})})}));
    const txUpdate = vi.fn(() => ({set: () => ({where: () => ({returning})})}));
    const tx = {update: txUpdate};
    const transaction = vi.fn(async (callback: (t: typeof tx) => unknown) => callback(tx));
    return {where, select, update, returning, tx, txUpdate, transaction, getGithubSettings: vi.fn(), provisionWebhooks: vi.fn()};
});

vi.mock('@gitgazer/db/client', () => ({db: {select: mocks.select, update: mocks.update, transaction: mocks.transaction}}));
vi.mock('@/domains/apps/github-settings', () => ({getGithubSettings: mocks.getGithubSettings}));
vi.mock('@/domains/github-app/webhook-provisioning', () => ({provisionWebhooks: mocks.provisionWebhooks, updateAllWebhookEvents: vi.fn()}));
vi.mock('@/domains/github-app/unlink-installation', () => ({unlinkInstallation: vi.fn()}));
vi.mock('@/domains/integrations/integrations.controller', () => ({
    deleteIntegration: vi.fn(),
    getIntegrations: vi.fn(),
    rotateSecret: vi.fn(),
    updateOrgSyncSettings: vi.fn(),
    upsertIntegration: vi.fn(),
}));
vi.mock('@/domains/integrations/integrations.middleware', () => ({
    addUserIntegrationsToCtxHono: async (c: {set: (key: string, value: unknown) => void}, next: () => Promise<void>) => {
        c.set('appContext', {userId: 1, integrations: ['i1'], integrationRoles: {i1: 'owner'}});
        await next();
    },
}));
vi.mock('@gitgazer/backend-services/event-log.controller', () => ({createEventLogEntry: vi.fn()}));
vi.mock('@gitgazer/backend-services/org-member-resolver', () => ({resolveAndAssignOrgMembers: vi.fn()}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => ({error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()})}));

const link = async () => testRequest(router, 'POST', '/api/integrations/i1/github-app', {body: {installation_id: 42}});

const installation = {installationId: 42, integrationId: null, accountLogin: 'acme', accountType: 'Organization', accountId: 500, senderId: 7};

// The route reads the installation first, then the requesting user's GitHub id
const givenLink = (inst: Record<string, unknown>, githubId: number | null) => {
    mocks.where.mockReset().mockResolvedValueOnce([inst]).mockResolvedValueOnce([{githubId}]);
};

describe('POST /api/integrations/:integrationId/github-app', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        givenLink(installation, 7);
    });

    it.each([
        ['another GitHub user', 8],
        ['a user without a GitHub id', null],
    ])('rejects with 403 and writes nothing when %s did not install it', async (_, githubId) => {
        givenLink(installation, githubId);

        const res = await link();

        expect(res.status).toBe(403);
        expect(mocks.transaction).not.toHaveBeenCalled();
        expect(mocks.provisionWebhooks).not.toHaveBeenCalled();
    });

    it('lets the owner of a personal account link an installation someone else created on it', async () => {
        givenLink({...installation, accountType: 'User'}, 500);
        mocks.getGithubSettings.mockResolvedValue({appId: 'app-g', secret: 's', orgSyncDefaultRole: 'viewer'});
        mocks.returning.mockResolvedValue([{installationId: 42}]);
        mocks.provisionWebhooks.mockResolvedValue(1);

        const res = await link();

        expect(res.status).toBe(200);
    });

    it('rejects with 409 and writes nothing when the integration has no GitHub app', async () => {
        mocks.getGithubSettings.mockResolvedValue(undefined);

        const res = await link();

        expect(res.status).toBe(409);
        expect(await res.text()).toContain('Install the GitHub app first');
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.txUpdate).not.toHaveBeenCalled();
        expect(mocks.provisionWebhooks).not.toHaveBeenCalled();
    });

    it('reads the GitHub settings with a share lock in the transaction that links the installation', async () => {
        mocks.getGithubSettings.mockResolvedValue({appId: 'app-g', secret: 's', orgSyncDefaultRole: 'viewer'});
        mocks.returning.mockResolvedValue([{installationId: 42}]);
        mocks.provisionWebhooks.mockResolvedValue(1);

        const res = await link();

        expect(res.status).toBe(200);
        expect(mocks.transaction).toHaveBeenCalledTimes(1);
        expect(mocks.getGithubSettings).toHaveBeenCalledWith(mocks.tx, 'i1', 'share');
        expect(mocks.txUpdate).toHaveBeenCalledTimes(1);
        expect(mocks.update).not.toHaveBeenCalled();
    });
});
