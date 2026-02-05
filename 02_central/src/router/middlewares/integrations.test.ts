import {beforeEach, describe, expect, it, vi} from 'vitest';

import {addUserIntegrationsToCtx} from './integrations';

// Mock dynamoDB client
vi.mock('@/clients/dynamodb', () => ({
    getUserIntegrations: vi.fn(),
}));

import {getUserIntegrations} from '@/clients/dynamodb';

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

    it('successfully fetches user integrations and calls next', async () => {
        const next = vi.fn(async () => undefined);
        vi.mocked(getUserIntegrations).mockResolvedValue(['integrationA', 'integrationB']);

        const out = await addUserIntegrationsToCtx({reqCtx: makeReqCtx('user123'), next});

        expect(out).toBeUndefined();
        expect(next).toHaveBeenCalledTimes(1);
        expect(getUserIntegrations).toHaveBeenCalledWith('user123');
    });

    it('successfully handles empty integrations array and calls next', async () => {
        const next = vi.fn(async () => undefined);
        vi.mocked(getUserIntegrations).mockResolvedValue([]);

        const out = await addUserIntegrationsToCtx({reqCtx: makeReqCtx('user123'), next});

        expect(out).toBeUndefined();
        expect(next).toHaveBeenCalledTimes(1);
        expect(getUserIntegrations).toHaveBeenCalledWith('user123');
    });

    it('throws error when getUserIntegrations throws an error', async () => {
        const next = vi.fn(async () => undefined);
        const error = new Error('DynamoDB connection failed');
        vi.mocked(getUserIntegrations).mockRejectedValue(error);

        await expect(addUserIntegrationsToCtx({reqCtx: makeReqCtx('user123'), next})).rejects.toThrow('DynamoDB connection failed');

        expect(next).not.toHaveBeenCalled();
        expect(getUserIntegrations).toHaveBeenCalledWith('user123');
    });
});
