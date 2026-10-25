import type {APIGatewayProxyEventV2, Context} from 'aws-lambda';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({role: 'viewer' as string, listApps: vi.fn()}));

vi.mock('@/domains/apps/apps.controller', () => ({
    listApps: mocks.listApps,
    installApp: vi.fn(),
    uninstallApp: vi.fn(),
    createHandle: vi.fn(),
    updateHandle: vi.fn(),
    deleteHandle: vi.fn(),
}));
vi.mock('@/domains/integrations/integrations.middleware', () => ({
    addUserIntegrationsToCtx: async ({reqCtx, next}: {reqCtx: {appContext?: unknown}; next: () => Promise<void>}) => {
        reqCtx.appContext = {userId: 1, integrations: ['i1'], integrationRoles: {i1: mocks.role}};
        await next();
    },
}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => ({error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()})}));

const listEvent = (): APIGatewayProxyEventV2 =>
    ({
        version: '2.0',
        routeKey: 'GET /api/integrations/{integrationId}/apps',
        rawPath: '/api/integrations/i1/apps',
        rawQueryString: '',
        headers: {},
        requestContext: {domainName: 'api.example.com', http: {method: 'GET', path: '/api/integrations/i1/apps'}},
        isBase64Encoded: false,
    }) as unknown as APIGatewayProxyEventV2;

describe('GET /api/integrations/:integrationId/apps', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.listApps.mockResolvedValue([]);
    });

    it.each([
        ['viewer', false],
        ['member', false],
        ['admin', true],
        ['owner', true],
    ])('passes canSeeSecrets for %s as %s', async (role, canSeeSecrets) => {
        mocks.role = role;
        const router = (await import('@/domains/apps/apps.routes')).default;

        const res = await router.resolve(listEvent(), {} as Context);

        expect(res.statusCode).toBe(200);
        expect(mocks.listApps).toHaveBeenCalledWith(expect.objectContaining({integrationId: 'i1', canSeeSecrets}));
    });
});
