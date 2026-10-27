import {describe, expect, it, vi} from 'vitest';

import {createHonoApp} from '@/shared/hono/app';
import type {AppEnv} from '@/shared/hono/env';
import {requireRole} from '@/shared/hono/require-role';
import {testRequest} from '@/shared/hono/test-request';
import {getLogger} from '@gitgazer/backend-core/logger';
import {Hono, type Context} from 'hono';

import type {MemberRole} from '@gitgazer/db/types';

const handler = vi.fn((c: Context<AppEnv>) => c.json({role: c.var.appContext?.role}));

function callRoute(
    minimumRole: MemberRole,
    opts: {integrationId?: string; integrationRoles?: Record<string, MemberRole>; userId?: number; method?: string; route?: string},
) {
    const method = opts.method ?? 'GET';
    const route = opts.route ?? (opts.integrationId ? '/api/integrations/:integrationId' : '/api/test');
    const app = createHonoApp();
    app.on(method, route, requireRole(minimumRole), handler);

    const path = route.replace(':integrationId', opts.integrationId ?? '').replace(':userId', '9');
    return testRequest(app, method, path, {
        appContext: {
            userId: opts.userId ?? 1,
            username: '',
            email: '',
            name: '',
            nickname: '',
            picture: '',
            integrationRoles: opts.integrationRoles,
        },
    });
}

async function expectRejected(res: Response, status: number, message: string) {
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({message});
    expect(handler).not.toHaveBeenCalled();
}

describe('requireRole middleware (hono)', () => {
    it('allows owner when owner is required', async () => {
        const res = await callRoute('owner', {integrationId: 'int-1', integrationRoles: {'int-1': 'owner'}});

        expect(handler).toHaveBeenCalledTimes(1);
        expect(await res.json()).toEqual({role: 'owner'});
    });

    it('allows owner when admin is required', async () => {
        const res = await callRoute('admin', {integrationId: 'int-1', integrationRoles: {'int-1': 'owner'}});

        expect(handler).toHaveBeenCalledTimes(1);
        expect(await res.json()).toEqual({role: 'owner'});
    });

    it('allows admin when admin is required', async () => {
        const res = await callRoute('admin', {integrationId: 'int-1', integrationRoles: {'int-1': 'admin'}});

        expect(handler).toHaveBeenCalledTimes(1);
        expect(await res.json()).toEqual({role: 'admin'});
    });

    it('allows member when member is required', async () => {
        const res = await callRoute('member', {integrationId: 'int-1', integrationRoles: {'int-1': 'member'}});

        expect(res.status).toBe(200);
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('rejects viewer when member is required', async () => {
        const res = await callRoute('member', {integrationId: 'int-1', integrationRoles: {'int-1': 'viewer'}});

        await expectRejected(res, 403, 'Insufficient permissions');
    });

    it('rejects member when admin is required', async () => {
        const res = await callRoute('admin', {integrationId: 'int-1', integrationRoles: {'int-1': 'member'}});

        await expectRejected(res, 403, 'Insufficient permissions');
    });

    it('rejects admin when owner is required', async () => {
        const res = await callRoute('owner', {integrationId: 'int-1', integrationRoles: {'int-1': 'admin'}});

        await expectRejected(res, 403, 'Insufficient permissions');
    });

    it('rejects when user is not a member of the integration', async () => {
        const res = await callRoute('viewer', {integrationId: 'int-unknown', integrationRoles: {'int-1': 'owner'}});

        await expectRejected(res, 403, 'Not a member of this integration');
    });

    it('rejects when integrationId is missing from path params', async () => {
        const res = await callRoute('viewer', {integrationRoles: {'int-1': 'owner'}});

        await expectRejected(res, 400, 'Missing integration identifier');
    });

    it('rejects when integrationRoles is not populated', async () => {
        const res = await callRoute('viewer', {integrationId: 'int-1'});

        await expectRejected(res, 403, 'Not a member of this integration');
    });

    it('allows viewer when viewer is required', async () => {
        const res = await callRoute('viewer', {integrationId: 'int-1', integrationRoles: {'int-1': 'viewer'}});

        expect(handler).toHaveBeenCalledTimes(1);
        expect(await res.json()).toEqual({role: 'viewer'});
    });

    describe('audit logging', () => {
        it('logs allowed authz decision at debug level with structured fields', async () => {
            await callRoute('admin', {integrationId: 'int-1', integrationRoles: {'int-1': 'owner'}, userId: 42, method: 'DELETE'});

            const logger = vi.mocked(getLogger).mock.results[0]!.value;
            expect(logger.debug).toHaveBeenCalledWith('authz', {
                userId: 42,
                integrationId: 'int-1',
                role: 'owner',
                minimumRole: 'admin',
                action: 'DELETE /api/integrations/:integrationId',
                allowed: true,
            });
        });

        it('logs denied authz decision at info level when role is insufficient', async () => {
            const res = await callRoute('admin', {integrationId: 'int-1', integrationRoles: {'int-1': 'member'}, userId: 7, method: 'PUT'});

            expect(res.status).toBe(403);
            const logger = vi.mocked(getLogger).mock.results[0]!.value;
            expect(logger.info).toHaveBeenCalledWith('authz', {
                userId: 7,
                integrationId: 'int-1',
                role: 'member',
                minimumRole: 'admin',
                action: 'PUT /api/integrations/:integrationId',
                allowed: false,
                reason: 'insufficient role',
            });
        });

        it('logs denied authz decision when user is not a member', async () => {
            const res = await callRoute('viewer', {integrationId: 'int-unknown', integrationRoles: {'int-1': 'owner'}, userId: 5});

            expect(res.status).toBe(403);
            const logger = vi.mocked(getLogger).mock.results[0]!.value;
            expect(logger.info).toHaveBeenCalledWith('authz', {
                userId: 5,
                integrationId: 'int-unknown',
                role: null,
                minimumRole: 'viewer',
                action: 'GET /api/integrations/:integrationId',
                allowed: false,
                reason: 'not a member',
            });
        });

        it('logs the full route pattern when the router is mounted below the root', async () => {
            const router = new Hono<AppEnv>();
            router.get('/integrations/:integrationId', requireRole('viewer'), handler);
            const app = new Hono<AppEnv>().route('/api', router);

            await testRequest(app, 'GET', '/api/integrations/int-1', {
                appContext: {userId: 1, username: '', email: '', name: '', nickname: '', picture: '', integrationRoles: {'int-1': 'viewer'}},
            });

            const logger = vi.mocked(getLogger).mock.results[0]!.value;
            expect(logger.debug).toHaveBeenCalledWith('authz', expect.objectContaining({action: 'GET /api/integrations/:integrationId'}));
        });

        it('logs action from the route path', async () => {
            await callRoute('member', {
                integrationId: 'int-1',
                integrationRoles: {'int-1': 'member'},
                method: 'PATCH',
                route: '/api/integrations/:integrationId/members/:userId/role',
            });

            const logger = vi.mocked(getLogger).mock.results[0]!.value;
            expect(logger.debug).toHaveBeenCalledWith(
                'authz',
                expect.objectContaining({
                    action: 'PATCH /api/integrations/:integrationId/members/:userId/role',
                }),
            );
        });
    });
});
