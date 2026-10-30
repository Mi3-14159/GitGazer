import type {AppEnv} from '@/shared/hono/env';
import {testRequest} from '@/shared/hono/test-request';
import * as crypto from 'crypto';
import {Hono} from 'hono';
import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@gitgazer/backend-core/config', () => ({default: {get: vi.fn(() => ['https://app.example.com'])}, loadConfig: vi.fn()}));
vi.mock('@gitgazer/backend-core/bootstrap', () => ({}));
vi.mock('@gitgazer/db/client', () => {
    return {
        initDb: vi.fn(),
        withRlsTransaction: vi.fn(),
    };
});

function settingsTx(rows: unknown[]) {
    return {select: () => ({from: () => ({innerJoin: () => ({where: () => rows})})})};
}

function signatureFor(payload: string | NodeJS.ArrayBufferView, secret: string) {
    const hmac = crypto.createHmac('sha256', secret);
    return 'sha256=' + hmac.update(payload).digest('hex');
}

async function mockSettings(rows: unknown[]) {
    const rds = await import('@gitgazer/db/client');
    (rds.withRlsTransaction as any).mockImplementation(async (params: {integrationIds: string[]; callback: Function}) => {
        return params.callback(settingsTx(rows));
    });
}

async function post(headers: Record<string, string>, body?: string, path = '/api/import/int-1') {
    const {verifyGithubSign} = await import('./webhooks.middleware');
    const next = vi.fn();
    const app = new Hono<AppEnv>();
    app.post('/api/import/:integrationId', verifyGithubSign, async (c) => {
        next();
        return c.json({received: await c.req.json()});
    });
    const res = await testRequest(app, 'POST', path, {headers, body});
    return {res, next, json: await res.json()};
}

describe('verifyGithubSign middleware', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('throws BadRequestError when integrationId path parameter is missing', async () => {
        const {verifyGithubSign} = await import('./webhooks.middleware');
        const next = vi.fn();
        const app = new Hono<AppEnv>();
        app.post('/api/github/webhook', verifyGithubSign, (c) => {
            next();
            return c.json({});
        });

        const res = await testRequest(app, 'POST', '/api/github/webhook', {body: 'x'});

        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({message: 'Missing integration ID in path parameters'});
        expect(next).not.toHaveBeenCalled();
    });

    it('rejects when the integration has no GitHub app', async () => {
        await mockSettings([]);

        const {res, next, json} = await post({}, 'x');

        expect(res.status).toBe(500);
        expect(json).toMatchObject({message: 'Integration secret not configured'});
        expect(next).not.toHaveBeenCalled();
    });

    it('throws BadRequestError when signature or payload is missing', async () => {
        await mockSettings([{appId: 'app-1', secret: 'shh', orgSyncDefaultRole: 'viewer'}]);

        const missingSig = await post({}, 'payload');
        expect(missingSig.res.status).toBe(400);
        expect(missingSig.json).toMatchObject({message: 'Missing signature or payload'});

        const missingBody = await post({'x-hub-signature-256': 'sha256=deadbeef'});
        expect(missingBody.res.status).toBe(400);
        expect(missingBody.json).toMatchObject({message: 'Missing signature or payload'});

        expect(missingSig.next).not.toHaveBeenCalled();
        expect(missingBody.next).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedError when signature is invalid', async () => {
        const secret = 'shh';
        await mockSettings([{appId: 'app-1', secret, orgSyncDefaultRole: 'viewer'}]);

        const payload = JSON.stringify({hello: 'world'});
        const good = signatureFor(payload, secret);
        const bad = good.slice(0, -1) + (good.endsWith('0') ? '1' : '0');

        const {res, next, json} = await post({'x-hub-signature-256': bad}, payload);

        expect(res.status).toBe(401);
        expect(json).toMatchObject({message: 'Invalid signature'});
        expect(next).not.toHaveBeenCalled();
    });

    it('rejects a signature of a different length', async () => {
        await mockSettings([{appId: 'app-1', secret: 'shh', orgSyncDefaultRole: 'viewer'}]);

        const {res, next} = await post({'x-hub-signature-256': 'sha256=short'}, JSON.stringify({ok: true}));

        expect(res.status).toBe(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('verifies the signature with the GitHub app secret', async () => {
        await mockSettings([{appId: 'app-1', secret: 'shh', orgSyncDefaultRole: 'viewer'}]);

        const payload = JSON.stringify({ok: true});
        const {res, next} = await post({'x-hub-signature-256': signatureFor(payload, 'shh')}, payload);

        expect(res.status).toBe(200);
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('verifies the signature over the raw bytes and still lets the handler parse JSON', async () => {
        await mockSettings([{appId: 'app-1', secret: 'shh', orgSyncDefaultRole: 'viewer'}]);

        const payload = '{ "name" :  "Zoë \u00fc \u2603 😀",\n   "n":1.0 }';
        expect(payload).not.toBe(JSON.stringify(JSON.parse(payload)));
        const {res, next, json} = await post({'x-hub-signature-256': signatureFor(Buffer.from(payload, 'utf-8'), 'shh')}, payload);

        expect(res.status).toBe(200);
        expect(next).toHaveBeenCalledTimes(1);
        expect(json).toEqual({received: {name: 'Zoë ü ☃ 😀', n: 1}});
    });
});
