import {beforeEach, describe, expect, it, vi} from 'vitest';

import {addUserIntegrationsToCtx} from './integrations.middleware';

// Mock integrations controller
vi.mock('@/domains/integrations/integrations.controller', () => ({
    getUserIntegrationRoles: vi.fn(),
}));

import {getUserIntegrationRoles} from '@/domains/integrations/integrations.controller';

function makeReqCtx(userId: string) {
    return {
        appContext: {
            userId,
        },
    } as any;
}

describe('extractUserIntegrations middleware', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('successfully fetches user integrations and roles and calls next', async () => {
        const next = vi.fn(async () => undefined);
        vi.mocked(getUserIntegrationRoles).mockResolvedValue({
            integrationA: 'owner',
            integrationB: 'member',
        });

        const reqCtx = makeReqCtx('user123');
        await addUserIntegrationsToCtx({reqCtx, next});

        expect(next).toHaveBeenCalledTimes(1);
        expect(getUserIntegrationRoles).toHaveBeenCalledWith('user123');
        expect(reqCtx.appContext.integrations).toEqual(['integrationA', 'integrationB']);
        expect(reqCtx.appContext.integrationRoles).toEqual({
            integrationA: 'owner',
            integrationB: 'member',
        });
    });

    it('successfully handles empty integrations and calls next', async () => {
        const next = vi.fn(async () => undefined);
        vi.mocked(getUserIntegrationRoles).mockResolvedValue({});

        const reqCtx = makeReqCtx('user123');
        await addUserIntegrationsToCtx({reqCtx, next});

        expect(next).toHaveBeenCalledTimes(1);
        expect(getUserIntegrationRoles).toHaveBeenCalledWith('user123');
        expect(reqCtx.appContext.integrations).toEqual([]);
        expect(reqCtx.appContext.integrationRoles).toEqual({});
    });

    it('throws error when getUserIntegrationRoles throws an error', async () => {
        const next = vi.fn(async () => undefined);
        const error = new Error('RDS connection failed');
        vi.mocked(getUserIntegrationRoles).mockRejectedValue(error);

        await expect(addUserIntegrationsToCtx({reqCtx: makeReqCtx('user123'), next})).rejects.toThrow('RDS connection failed');

        expect(next).not.toHaveBeenCalled();
        expect(getUserIntegrationRoles).toHaveBeenCalledWith('user123');
    });
});
