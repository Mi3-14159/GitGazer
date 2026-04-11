import {beforeEach, describe, expect, it, vi} from 'vitest';

import {requireRole} from './require-role';

import type {MemberRole} from '@gitgazer/db/types';

function makeReqCtx(opts: {integrationId?: string; integrationRoles?: Record<string, MemberRole>; userId?: number}) {
    return {
        params: opts.integrationId ? {integrationId: opts.integrationId} : {},
        appContext: {
            userId: opts.userId ?? 1,
            integrationRoles: opts.integrationRoles,
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
});
