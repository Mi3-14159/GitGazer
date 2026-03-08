import * as crypto from 'crypto';
import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@gitgazer/db/client', () => {
    return {
        withRlsTransaction: vi.fn(),
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

    it('throws BadRequestError when integrationId path parameter is missing', async () => {
        const {verifyGithubSign} = await import('./verifyGithubSign');
        const next = vi.fn(async () => undefined);

        const event = {
            pathParameters: {},
            headers: {},
            body: 'x',
        };

        await expect(verifyGithubSign({reqCtx: makeReqCtx(event), next} as any)).rejects.toThrow('Missing integration ID in path parameters');

        expect(next).not.toHaveBeenCalled();
    });

    it('throws BadRequestError when integration cannot be found (missing secret)', async () => {
        const rds = await import('@gitgazer/db/client');
        const {verifyGithubSign} = await import('./verifyGithubSign');
        const next = vi.fn(async () => undefined);
        (rds.withRlsTransaction as any).mockImplementation(async (_ids: any, callback: any) => {
            return callback({select: () => ({from: () => [{id: 'int-1'}]})});
        });

        const event = {
            pathParameters: {integrationId: 'int-1'},
            headers: {},
            body: 'x',
        };

        await expect(verifyGithubSign({reqCtx: makeReqCtx(event), next} as any)).rejects.toThrow('Integration secret not configured');

        expect(next).not.toHaveBeenCalled();
    });

    it('throws BadRequestError when signature or payload is missing', async () => {
        const rds = await import('@gitgazer/db/client');
        const {verifyGithubSign} = await import('./verifyGithubSign');
        const next = vi.fn(async () => undefined);
        (rds.withRlsTransaction as any).mockImplementation(async (_ids: any, callback: any) => {
            return callback({select: () => ({from: () => [{id: 'int-1', secret: 'shh'}]})});
        });

        const eventMissingSig = {
            pathParameters: {integrationId: 'int-1'},
            headers: {},
            body: 'payload',
        };

        await expect(verifyGithubSign({reqCtx: makeReqCtx(eventMissingSig), next} as any)).rejects.toThrow('Missing signature or payload');

        const eventMissingBody = {
            pathParameters: {integrationId: 'int-1'},
            headers: {'x-hub-signature-256': 'sha256=deadbeef'},
            body: undefined,
        };

        await expect(verifyGithubSign({reqCtx: makeReqCtx(eventMissingBody), next} as any)).rejects.toThrow('Missing signature or payload');

        expect(next).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedError when signature is invalid', async () => {
        const rds = await import('@gitgazer/db/client');
        const {verifyGithubSign} = await import('./verifyGithubSign');
        const next = vi.fn(async () => undefined);
        const secret = 'shh';
        (rds.withRlsTransaction as any).mockImplementation(async (_ids: any, callback: any) => {
            return callback({select: () => ({from: () => [{id: 'int-1', secret}]})});
        });

        const payload = JSON.stringify({hello: 'world'});
        const good = signatureFor(payload, secret);
        const bad = good.slice(0, -1) + (good.endsWith('0') ? '1' : '0');

        const event = {
            pathParameters: {integrationId: 'int-1'},
            headers: {'x-hub-signature-256': bad},
            body: payload,
        };

        await expect(verifyGithubSign({reqCtx: makeReqCtx(event), next} as any)).rejects.toThrow('Invalid signature');

        expect(next).not.toHaveBeenCalled();
    });

    it('calls next when signature is valid', async () => {
        const rds = await import('@gitgazer/db/client');
        const {verifyGithubSign} = await import('./verifyGithubSign');
        const next = vi.fn(async () => undefined);
        const secret = 'shh';
        (rds.withRlsTransaction as any).mockImplementation(async (_ids: any, callback: any) => {
            return callback({select: () => ({from: () => [{id: 'int-1', secret}]})});
        });

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
