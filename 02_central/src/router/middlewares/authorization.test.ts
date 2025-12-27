import {beforeEach, describe, expect, it, vi} from 'vitest';

import {extractCognitoGroups} from './authorization';

function makeReqCtx(event: any) {
    return {event} as any;
}

describe('extractCognitoGroups middleware', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('skips authorization for cognito auth routes', async () => {
        const next = vi.fn(async () => undefined);

        const event = {
            rawPath: '/api/auth/cognito/callback',
            requestContext: {
                authorizer: {
                    jwt: {
                        claims: {},
                    },
                },
            },
        };

        const out = await extractCognitoGroups({reqCtx: makeReqCtx(event), next});

        expect(out).toBeUndefined();
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('returns 401 when cognito:groups is missing', async () => {
        const next = vi.fn(async () => undefined);

        const event = {
            rawPath: '/api/notifications',
            requestContext: {
                authorizer: {
                    jwt: {
                        claims: {},
                    },
                },
            },
        };

        const out = await extractCognitoGroups({reqCtx: makeReqCtx(event), next});

        expect(next).not.toHaveBeenCalled();
        expect(out).toBeInstanceOf(Response);
        const res = out as Response;
        expect(res.status).toBe(401);
        await expect(res.json()).resolves.toEqual({error: 'Unauthorized: missing cognito:groups'});
    });

    it('parses cognito:groups string into string[] and calls next', async () => {
        const next = vi.fn(async () => undefined);

        const event: any = {
            rawPath: '/api/notifications',
            requestContext: {
                authorizer: {
                    jwt: {
                        claims: {
                            'cognito:groups': '[integrationA integrationB]'
                        },
                    },
                },
            },
        };

        const out = await extractCognitoGroups({reqCtx: makeReqCtx(event), next});

        expect(out).toBeUndefined();
        expect(next).toHaveBeenCalledTimes(1);
        expect(event.requestContext.authorizer.jwt.claims['cognito:groups']).toEqual(['integrationA', 'integrationB']);
    });
});
