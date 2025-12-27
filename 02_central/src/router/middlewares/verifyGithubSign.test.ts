import {beforeEach, describe, expect, it, vi} from 'vitest';
import * as crypto from 'crypto';

vi.mock('@/clients/dynamodb', () => {
    return {
        getIntegrations: vi.fn(),
    };
});

function makeReqCtx(event: any) {
    return {event} as any;
}

function signatureFor(payload: string, secret: string) {
    const hmac = crypto.createHmac('sha256', secret);
    return 'sha256=' + hmac.update(payload).digest('hex');
}

describe('verifyGithubSign middleware', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 400 when integrationId path parameter is missing', async () => {
        const {verifyGithubSign} = await import('./verifyGithubSign');
        const next = vi.fn(async () => undefined);

        const event = {
            pathParameters: {},
            headers: {},
            body: 'x',
        };

        const out = await verifyGithubSign({reqCtx: makeReqCtx(event), next} as any);

        expect(next).not.toHaveBeenCalled();
        expect(out).toBeInstanceOf(Response);
        expect((out as Response).status).toBe(400);
    });

    it('returns 400 when integration cannot be found (missing secret)', async () => {
        const dynamodb = await import('@/clients/dynamodb');
        const {verifyGithubSign} = await import('./verifyGithubSign');
        const next = vi.fn(async () => undefined);
        (dynamodb.getIntegrations as any).mockResolvedValue([]);

        const event = {
            pathParameters: {integrationId: 'int-1'},
            headers: {},
            body: 'x',
        };

        const out = await verifyGithubSign({reqCtx: makeReqCtx(event), next} as any);

        expect(next).not.toHaveBeenCalled();
        expect(out).toBeInstanceOf(Response);
        expect((out as Response).status).toBe(400);
    });

    it('returns 400 when signature or payload is missing', async () => {
        const dynamodb = await import('@/clients/dynamodb');
        const {verifyGithubSign} = await import('./verifyGithubSign');
        const next = vi.fn(async () => undefined);
        (dynamodb.getIntegrations as any).mockResolvedValue([{id: 'int-1', secret: 'shh'}]);

        const eventMissingSig = {
            pathParameters: {integrationId: 'int-1'},
            headers: {},
            body: 'payload',
        };

        const out1 = await verifyGithubSign({reqCtx: makeReqCtx(eventMissingSig), next} as any);
        expect(out1).toBeInstanceOf(Response);
        expect((out1 as Response).status).toBe(400);

        const eventMissingBody = {
            pathParameters: {integrationId: 'int-1'},
            headers: {'x-hub-signature-256': 'sha256=deadbeef'},
            body: undefined,
        };

        const out2 = await verifyGithubSign({reqCtx: makeReqCtx(eventMissingBody), next} as any);
        expect(out2).toBeInstanceOf(Response);
        expect((out2 as Response).status).toBe(400);

        expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when signature is invalid', async () => {
        const dynamodb = await import('@/clients/dynamodb');
        const {verifyGithubSign} = await import('./verifyGithubSign');
        const next = vi.fn(async () => undefined);
        const secret = 'shh';
        (dynamodb.getIntegrations as any).mockResolvedValue([{id: 'int-1', secret}]);

        const payload = JSON.stringify({hello: 'world'});
        const good = signatureFor(payload, secret);
        const bad = good.slice(0, -1) + (good.endsWith('0') ? '1' : '0');

        const event = {
            pathParameters: {integrationId: 'int-1'},
            headers: {'x-hub-signature-256': bad},
            body: payload,
        };

        const out = await verifyGithubSign({reqCtx: makeReqCtx(event), next} as any);

        expect(next).not.toHaveBeenCalled();
        expect(out).toBeInstanceOf(Response);
        expect((out as Response).status).toBe(401);
    });

    it('calls next when signature is valid', async () => {
        const dynamodb = await import('@/clients/dynamodb');
        const {verifyGithubSign} = await import('./verifyGithubSign');
        const next = vi.fn(async () => undefined);
        const secret = 'shh';
        (dynamodb.getIntegrations as any).mockResolvedValue([{id: 'int-1', secret}]);

        const payload = JSON.stringify({ok: true});
        const sig = signatureFor(payload, secret);

        const event = {
            pathParameters: {integrationId: 'int-1'},
            headers: {'x-hub-signature-256': sig},
            body: payload,
        };

        const out = await verifyGithubSign({reqCtx: makeReqCtx(event), next} as any);

        expect(out).toBeUndefined();
        expect(next).toHaveBeenCalledTimes(1);
    });
});
