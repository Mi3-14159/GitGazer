import {beforeEach, describe, expect, it, vi} from 'vitest';

import {getLogger} from '@/shared/logger';
import {requireRole} from './require-role';

import type {MemberRole} from '@gitgazer/db/types';

function makeReqCtx(opts: {integrationId?: string; integrationRoles?: Record<string, MemberRole>; userId?: number; routeKey?: string}) {
    return {
        params: opts.integrationId ? {integrationId: opts.integrationId} : {},
        appContext: {
            userId: opts.userId ?? 1,
            integrationRoles: opts.integrationRoles,
        },
        event: {
            routeKey: opts.routeKey ?? 'GET /api/test',
        },
    } as any;
}

describe('requireRole middleware', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('allows owner when owner is required', async () => {
        const next = vi.fn(async () => undefined);
        const middleware = requireRole('owner');

        const reqCtx = makeReqCtx({
            integrationId: 'int-1',
            integrationRoles: {'int-1': 'owner'},
        });

        await middleware({reqCtx, next});

        expect(next).toHaveBeenCalledTimes(1);
        expect(reqCtx.appContext.role).toBe('owner');
    });

    it('allows owner when admin is required', async () => {
        const next = vi.fn(async () => undefined);
        const middleware = requireRole('admin');

        const reqCtx = makeReqCtx({
            integrationId: 'int-1',
            integrationRoles: {'int-1': 'owner'},
        });

        await middleware({reqCtx, next});

        expect(next).toHaveBeenCalledTimes(1);
        expect(reqCtx.appContext.role).toBe('owner');
    });

    it('allows admin when admin is required', async () => {
        const next = vi.fn(async () => undefined);
        const middleware = requireRole('admin');

        const reqCtx = makeReqCtx({
            integrationId: 'int-1',
            integrationRoles: {'int-1': 'admin'},
        });

        await middleware({reqCtx, next});

        expect(next).toHaveBeenCalledTimes(1);
        expect(reqCtx.appContext.role).toBe('admin');
    });

    it('allows member when member is required', async () => {
        const next = vi.fn(async () => undefined);
        const middleware = requireRole('member');

        const reqCtx = makeReqCtx({
            integrationId: 'int-1',
            integrationRoles: {'int-1': 'member'},
        });

        await middleware({reqCtx, next});

        expect(next).toHaveBeenCalledTimes(1);
    });

    it('rejects viewer when member is required', async () => {
        const next = vi.fn(async () => undefined);
        const middleware = requireRole('member');

        const reqCtx = makeReqCtx({
            integrationId: 'int-1',
            integrationRoles: {'int-1': 'viewer'},
        });

        await expect(middleware({reqCtx, next})).rejects.toThrow('Insufficient permissions');
        expect(next).not.toHaveBeenCalled();
    });

    it('rejects member when admin is required', async () => {
        const next = vi.fn(async () => undefined);
        const middleware = requireRole('admin');

        const reqCtx = makeReqCtx({
            integrationId: 'int-1',
            integrationRoles: {'int-1': 'member'},
        });

        await expect(middleware({reqCtx, next})).rejects.toThrow('Insufficient permissions');
        expect(next).not.toHaveBeenCalled();
    });

    it('rejects admin when owner is required', async () => {
        const next = vi.fn(async () => undefined);
        const middleware = requireRole('owner');

        const reqCtx = makeReqCtx({
            integrationId: 'int-1',
            integrationRoles: {'int-1': 'admin'},
        });

        await expect(middleware({reqCtx, next})).rejects.toThrow('Insufficient permissions');
        expect(next).not.toHaveBeenCalled();
    });

    it('rejects when user is not a member of the integration', async () => {
        const next = vi.fn(async () => undefined);
        const middleware = requireRole('viewer');

        const reqCtx = makeReqCtx({
            integrationId: 'int-unknown',
            integrationRoles: {'int-1': 'owner'},
        });

        await expect(middleware({reqCtx, next})).rejects.toThrow('Not a member of this integration');
        expect(next).not.toHaveBeenCalled();
    });

    it('rejects when integrationId is missing from path params', async () => {
        const next = vi.fn(async () => undefined);
        const middleware = requireRole('viewer');

        const reqCtx = makeReqCtx({
            integrationRoles: {'int-1': 'owner'},
        });

        await expect(middleware({reqCtx, next})).rejects.toThrow(/Missing integration identifier/);
        expect(next).not.toHaveBeenCalled();
    });

    it('rejects when integrationRoles is not populated', async () => {
        const next = vi.fn(async () => undefined);
        const middleware = requireRole('viewer');

        const reqCtx = makeReqCtx({
            integrationId: 'int-1',
        });

        await expect(middleware({reqCtx, next})).rejects.toThrow('Not a member of this integration');
        expect(next).not.toHaveBeenCalled();
    });

    it('allows viewer when viewer is required', async () => {
        const next = vi.fn(async () => undefined);
        const middleware = requireRole('viewer');

        const reqCtx = makeReqCtx({
            integrationId: 'int-1',
            integrationRoles: {'int-1': 'viewer'},
        });

        await middleware({reqCtx, next});

        expect(next).toHaveBeenCalledTimes(1);
        expect(reqCtx.appContext.role).toBe('viewer');
    });

    describe('audit logging', () => {
        it('logs allowed authz decision at debug level with structured fields', async () => {
            const next = vi.fn(async () => undefined);
            const middleware = requireRole('admin');

            const reqCtx = makeReqCtx({
                integrationId: 'int-1',
                integrationRoles: {'int-1': 'owner'},
                userId: 42,
                routeKey: 'DELETE /api/integrations/{integrationId}',
            });

            await middleware({reqCtx, next});

            const logger = vi.mocked(getLogger).mock.results[0]!.value;
            expect(logger.debug).toHaveBeenCalledWith('authz', {
                userId: 42,
                integrationId: 'int-1',
                role: 'owner',
                minimumRole: 'admin',
                action: 'DELETE /api/integrations/{integrationId}',
                allowed: true,
            });
        });

        it('logs denied authz decision at info level when role is insufficient', async () => {
            const next = vi.fn(async () => undefined);
            const middleware = requireRole('admin');

            const reqCtx = makeReqCtx({
                integrationId: 'int-1',
                integrationRoles: {'int-1': 'member'},
                userId: 7,
                routeKey: 'PUT /api/integrations/{integrationId}',
            });

            await expect(middleware({reqCtx, next})).rejects.toThrow('Insufficient permissions');

            const logger = vi.mocked(getLogger).mock.results[0]!.value;
            expect(logger.info).toHaveBeenCalledWith('authz', {
                userId: 7,
                integrationId: 'int-1',
                role: 'member',
                minimumRole: 'admin',
                action: 'PUT /api/integrations/{integrationId}',
                allowed: false,
                reason: 'insufficient role',
            });
        });

        it('logs denied authz decision when user is not a member', async () => {
            const next = vi.fn(async () => undefined);
            const middleware = requireRole('viewer');

            const reqCtx = makeReqCtx({
                integrationId: 'int-unknown',
                integrationRoles: {'int-1': 'owner'},
                userId: 5,
            });

            await expect(middleware({reqCtx, next})).rejects.toThrow('Not a member of this integration');

            const logger = vi.mocked(getLogger).mock.results[0]!.value;
            expect(logger.info).toHaveBeenCalledWith('authz', {
                userId: 5,
                integrationId: 'int-unknown',
                role: null,
                minimumRole: 'viewer',
                action: 'GET /api/test',
                allowed: false,
                reason: 'not a member',
            });
        });

        it('logs action from routeKey', async () => {
            const next = vi.fn(async () => undefined);
            const middleware = requireRole('member');

            const reqCtx = makeReqCtx({
                integrationId: 'int-1',
                integrationRoles: {'int-1': 'member'},
                routeKey: 'PATCH /api/integrations/{integrationId}/members/{userId}/role',
            });

            await middleware({reqCtx, next});

            const logger = vi.mocked(getLogger).mock.results[0]!.value;
            expect(logger.debug).toHaveBeenCalledWith(
                'authz',
                expect.objectContaining({
                    action: 'PATCH /api/integrations/{integrationId}/members/{userId}/role',
                }),
            );
        });
    });
});
