import {beforeEach, describe, expect, it, vi} from 'vitest';

import {extractUserIntegrations} from './authorization';

// Mock dynamoDB client
vi.mock('@/clients/dynamodb', () => ({
    getUserIntegrations: vi.fn(),
}));

import {getUserIntegrations} from '@/clients/dynamodb';

function makeReqCtx(event: any) {
    return {event} as any;
}

describe('extractUserIntegrations middleware', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('skips authorization for cognito auth routes', async () => {
        const next = vi.fn(async () => undefined);

        const event = {
            rawPath: '/api/auth/cognito/callback',
            requestContext: {
                authorizer: {
                    lambda: {},
                },
            },
        };

        const out = await extractUserIntegrations({reqCtx: makeReqCtx(event), next});

        expect(out).toBeUndefined();
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('returns 401 when sub claim is missing', async () => {
        const next = vi.fn(async () => undefined);

        const event = {
            rawPath: '/api/notifications',
            requestContext: {
                authorizer: {
                    lambda: {},
                },
            },
        };

        const out = await extractUserIntegrations({reqCtx: makeReqCtx(event), next});

        expect(next).not.toHaveBeenCalled();
        expect(out).toBeInstanceOf(Response);
        const res = out as Response;
        expect(res.status).toBe(401);
        await expect(res.json()).resolves.toEqual({error: 'Unauthorized: missing user context'});
    });

    it('returns 401 when user has no integrations', async () => {
        const next = vi.fn(async () => undefined);
        vi.mocked(getUserIntegrations).mockResolvedValue([]);

        const event = {
            rawPath: '/api/notifications',
            requestContext: {
                authorizer: {
                    lambda: {
                        userId: 'user123',
                    },
                },
            },
        };

        const out = await extractUserIntegrations({reqCtx: makeReqCtx(event), next});

        expect(next).not.toHaveBeenCalled();
        expect(out).toBeInstanceOf(Response);
        const res = out as Response;
        expect(res.status).toBe(401);
        await expect(res.json()).resolves.toEqual({error: 'Unauthorized: user has no integrations'});
    });

    it('populates cognito:groups with integrations from DynamoDB and calls next', async () => {
        const next = vi.fn(async () => undefined);
        vi.mocked(getUserIntegrations).mockResolvedValue(['integrationA', 'integrationB']);

        const event: any = {
            rawPath: '/api/notifications',
            requestContext: {
                authorizer: {
                    lambda: {
                        userId: 'user123',
                    },
                },
            },
        };

        const out = await extractUserIntegrations({reqCtx: makeReqCtx(event), next});

        expect(out).toBeUndefined();
        expect(next).toHaveBeenCalledTimes(1);
        expect(getUserIntegrations).toHaveBeenCalledWith('user123');
        expect(event.requestContext.authorizer.lambda.integrations).toEqual(['integrationA', 'integrationB']);
    });
});
