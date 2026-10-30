import router from '@/domains/integrations/integrations.routes';
import type {AppEnv} from '@/shared/hono/env';
import {testRequest} from '@/shared/hono/test-request';
import type {MemberRole} from '@gitgazer/db/types';
import {Hono} from 'hono';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const app = new Hono<AppEnv>().route('/api/integrations', router);

const mocks = vi.hoisted(() => {
    const where = vi.fn();
    const select = vi.fn(() => ({from: () => ({where})}));
    const returning = vi.fn();
    const update = vi.fn(() => ({set: () => ({where: () => ({returning})})}));
    const txUpdate = vi.fn(() => ({set: () => ({where: () => ({returning})})}));
    const tx = {update: txUpdate};
    const transaction = vi.fn(async (callback: (t: typeof tx) => unknown) => callback(tx));
    return {
        where,
        select,
        update,
        returning,
        tx,
        txUpdate,
        transaction,
        getGithubSettings: vi.fn(),
        provisionWebhooks: vi.fn(),
        deleteIntegration: vi.fn(),
        role: {current: 'owner'},
    };
});

vi.mock('@gitgazer/db/client', () => ({db: {select: mocks.select, update: mocks.update, transaction: mocks.transaction}}));
vi.mock('@gitgazer/backend-services/github-app/github-settings', () => ({getGithubSettings: mocks.getGithubSettings}));
vi.mock('@gitgazer/backend-services/github-app/webhook-provisioning', () => ({
    provisionWebhooks: mocks.provisionWebhooks,
    updateAllWebhookEvents: vi.fn(),
}));
vi.mock('@/domains/github-app/unlink-installation', () => ({unlinkInstallation: vi.fn()}));
vi.mock('@/domains/integrations/integrations.controller', () => ({
    deleteIntegration: mocks.deleteIntegration,
    getIntegrations: vi.fn(),
    rotateSecret: vi.fn(),
    updateOrgSyncSettings: vi.fn(),
    upsertIntegration: vi.fn(),
}));
vi.mock('@gitgazer/backend-services/event-log.controller', () => ({createEventLogEntry: vi.fn()}));
vi.mock('@gitgazer/backend-services/org-member-resolver', () => ({resolveAndAssignOrgMembers: vi.fn()}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => ({error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()})}));

const callerContext = () => ({
    userId: 1,
    username: '',
    email: '',
    name: '',
    nickname: '',
    picture: '',
    integrations: ['i1'],
    integrationRoles: {i1: mocks.role.current} as Record<string, MemberRole>,
});

describe('DELETE /api/integrations/:integrationId', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.role.current = 'owner';
    });

    it.each(['admin', 'member', 'viewer'])('refuses an %s before the controller runs', async (role) => {
        mocks.role.current = role;

        const res = await testRequest(app, 'DELETE', '/api/integrations/i1', {appContext: callerContext()});

        expect(res.status).toBe(403);
        expect(mocks.deleteIntegration).not.toHaveBeenCalled();
    });

    it('deletes for an owner', async () => {
        const res = await testRequest(app, 'DELETE', '/api/integrations/i1', {appContext: callerContext()});

        expect(res.status).toBe(204);
        expect(mocks.deleteIntegration).toHaveBeenCalledWith('i1', ['i1'], 1);
    });
});

const link = async () => testRequest(app, 'POST', '/api/integrations/i1/github-app', {appContext: callerContext(), body: {installation_id: 42}});

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
