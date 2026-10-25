import type {APIGatewayProxyEventV2, Context} from 'aws-lambda';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => {
    const where = vi.fn();
    const select = vi.fn(() => ({from: () => ({where})}));
    const returning = vi.fn();
    const update = vi.fn(() => ({set: () => ({where: () => ({returning})})}));
    return {where, select, update, returning, getGithubSettings: vi.fn(), provisionWebhooks: vi.fn()};
});

vi.mock('@gitgazer/db/client', () => ({db: {select: mocks.select, update: mocks.update}}));
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
    addUserIntegrationsToCtx: async ({reqCtx, next}: {reqCtx: {appContext?: unknown}; next: () => Promise<void>}) => {
        reqCtx.appContext = {userId: 1, integrations: ['i1'], integrationRoles: {i1: 'owner'}};
        await next();
    },
}));
vi.mock('@gitgazer/backend-services/event-log.controller', () => ({createEventLogEntry: vi.fn()}));
vi.mock('@gitgazer/backend-services/org-member-resolver', () => ({resolveAndAssignOrgMembers: vi.fn()}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => ({error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()})}));

const linkEvent = (): APIGatewayProxyEventV2 =>
    ({
        version: '2.0',
        routeKey: 'POST /api/integrations/{integrationId}/github-app',
        rawPath: '/api/integrations/i1/github-app',
        rawQueryString: '',
        headers: {'content-type': 'application/json'},
        requestContext: {domainName: 'api.example.com', http: {method: 'POST', path: '/api/integrations/i1/github-app'}},
        body: JSON.stringify({installation_id: 42}),
        isBase64Encoded: false,
    }) as unknown as APIGatewayProxyEventV2;

describe('POST /api/integrations/:integrationId/github-app', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.where.mockResolvedValue([{installationId: 42, integrationId: null, accountLogin: 'acme', accountType: 'Organization'}]);
    });

    it('rejects with 409 and writes nothing when the integration has no GitHub app', async () => {
        mocks.getGithubSettings.mockResolvedValue(undefined);
        const router = (await import('@/domains/integrations/integrations.routes')).default;

        const res = await router.resolve(linkEvent(), {} as Context);

        expect(res.statusCode).toBe(409);
        expect(res.body).toContain('Install the GitHub app first');
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.provisionWebhooks).not.toHaveBeenCalled();
    });
});
