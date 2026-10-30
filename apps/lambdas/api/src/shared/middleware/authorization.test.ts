import {Hono} from 'hono';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {AppEnv} from '@/shared/hono/env';

const mocks = vi.hoisted(() => ({
    roles: vi.fn(),
    logger: {debug: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn()},
}));

vi.mock('@gitgazer/backend-core/bootstrap', () => ({}));
vi.mock('@gitgazer/backend-core/config', () => ({default: {get: vi.fn(() => ['https://app.example.com'])}, loadConfig: vi.fn()}));
vi.mock('@gitgazer/db/client', () => ({
    db: {insert: () => ({values: () => ({onConflictDoUpdate: () => ({returning: async () => [{id: 7}]})})})},
    initDb: vi.fn(),
    withRlsTransaction: vi.fn(),
}));
vi.mock('@/shared/middleware/token-verifier', () => ({
    getVerifiers: () => ({
        accessTokenVerifier: {verify: async () => ({sub: 'sub-1', username: 'octo'})},
        idTokenVerifier: {verify: async () => ({sub: 'sub-1', email: 'octo@example.com', nickname: 'octo'})},
    }),
}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => mocks.logger}));
vi.mock('@/domains/integrations/integrations.controller', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    getUserIntegrationRoles: mocks.roles,
}));

import {createApp, createBaseApp} from '@/app';
import {authorize} from '@/shared/middleware/authorization';
import {OPERATIONS, ROUTES} from '@/shared/permissions/table';
import {hasRole, type MemberRole} from '@gitgazer/db/types';

const roleOrder: MemberRole[] = ['viewer', 'member', 'admin', 'owner'];

const buildApp = () => {
    const app = createBaseApp();
    app.use(async (c, next) => {
        c.set('appContext', {userId: 7, username: 'octo', email: '', name: '', nickname: '', picture: ''});
        await next();
    });
    app.use(authorize);
    for (const key of Object.keys(ROUTES)) {
        const [method, path] = key.split(' ');
        app.on(method, path, (c) => c.json({role: c.var.appContext?.role ?? null}));
    }
    app.get('/api/unlisted', (c) => c.json({}));
    return app;
};

const send = (app: Hono<AppEnv>, method: string, path: string) => app.request(path, {method});

const concretePath = (pattern: string) => pattern.replace(':integrationId', 'i1').replace(/:(\w+)(\{.+\})?/g, 'x');

const minRoleRoutes = Object.entries(ROUTES).flatMap(([key, operation]) => {
    const operationEntry: {access: unknown; checkedInHandler?: true} = OPERATIONS[operation];
    const access = operationEntry.access;
    if (typeof access === 'string' || operationEntry.checkedInHandler) return [];
    return [[key, (access as {minRole: MemberRole}).minRole] as const];
});

describe('authorize', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.roles.mockResolvedValue({i1: 'owner'});
    });

    it.each(minRoleRoutes)('%s refuses roles below %s and allows it', async (key, minRole) => {
        const [method, pattern] = key.split(' ');
        const path = concretePath(pattern);

        for (const role of roleOrder) {
            mocks.roles.mockResolvedValue({i1: role});
            const res = await send(buildApp(), method, path);

            if (hasRole(role, minRole)) {
                expect(res.status).toBe(200);
            } else {
                expect(res.status).toBe(403);
                expect((await res.json()).message).toBe('Insufficient permissions');
            }
        }
    });

    it('refuses a member of other integrations with Not a member', async () => {
        mocks.roles.mockResolvedValue({other: 'owner'});

        const res = await send(buildApp(), 'GET', '/api/integrations/i1/members');

        expect(res.status).toBe(403);
        expect((await res.json()).message).toBe('Not a member of this integration');
    });

    it('reads integrationId from a nested pattern', async () => {
        mocks.roles.mockResolvedValue({i1: 'viewer', a1: 'owner'});

        const res = await send(buildApp(), 'DELETE', '/api/integrations/i1/apps/a1');

        expect(res.status).toBe(403);
        expect(mocks.logger.info).toHaveBeenCalledWith(
            'authz',
            expect.objectContaining({integrationId: 'i1', role: 'viewer', reason: 'insufficient role'}),
        );
    });

    it('treats a trailing slash like the route without it', async () => {
        mocks.roles.mockResolvedValue({i1: 'viewer'});

        const res = await send(buildApp(), 'GET', '/api/integrations/i1/members/');

        expect(res.status).toBe(200);
    });

    it('uses the GET entry for HEAD', async () => {
        mocks.roles.mockResolvedValue({i1: 'viewer'});

        const res = await send(buildApp(), 'HEAD', '/api/integrations/i1/members');

        expect(res.status).toBe(200);
    });

    it('lets an OPTIONS preflight through to CORS', async () => {
        const res = await createApp().request('/api/integrations/i1/members', {
            method: 'OPTIONS',
            headers: {origin: 'https://app.example.com', 'access-control-request-method': 'GET'},
        });

        expect([401, 403]).not.toContain(res.status);
    });

    it('is mounted by createApp', async () => {
        mocks.roles.mockResolvedValue({i1: 'viewer'});

        const res = await createApp().request('/api/integrations/i1', {method: 'DELETE', headers: {cookie: 'accessToken=access; idToken=id'}});

        expect(res.status).toBe(403);
        expect((await res.json()).message).toBe('Insufficient permissions');
        expect(mocks.logger.info).toHaveBeenCalledWith('authz', expect.objectContaining({action: 'integration.delete', allowed: false}));
    });

    it('answers 404 for an unknown path', async () => {
        const res = await send(buildApp(), 'GET', '/api/nope');

        expect(res.status).toBe(404);
    });

    it('refuses a matched route without a table entry', async () => {
        const res = await send(buildApp(), 'GET', '/api/unlisted');

        expect(res.status).toBe(403);
        expect((await res.json()).message).toBe('Insufficient permissions');
        expect(mocks.logger.info).toHaveBeenCalledWith('authz', expect.objectContaining({allowed: false, reason: 'no permission entry'}));
    });

    it('loads roles only for minRole operations', async () => {
        await send(buildApp(), 'GET', '/api/workflows');
        expect(mocks.roles).not.toHaveBeenCalled();

        await send(buildApp(), 'GET', '/api/integrations/i1/members');
        expect(mocks.roles).toHaveBeenCalledWith(7);
    });

    it('sets appContext.role for the handler', async () => {
        mocks.roles.mockResolvedValue({i1: 'admin'});

        const res = await send(buildApp(), 'GET', '/api/integrations/i1/members');

        expect(await res.json()).toEqual({role: 'admin'});
    });
});
