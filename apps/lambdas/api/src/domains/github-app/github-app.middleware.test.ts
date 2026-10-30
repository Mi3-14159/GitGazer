import type {AppEnv} from '@/shared/hono/env';
import {testRequest} from '@/shared/hono/test-request';
import * as crypto from 'crypto';
import {Hono} from 'hono';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const {configGetMock, handleGithubAppEventMock} = vi.hoisted(() => ({
    configGetMock: vi.fn((key: string) => {
        if (key === 'githubApp') return {webhookSecret: 'shh'};
        return ['https://app.example.com'];
    }),
    handleGithubAppEventMock: vi.fn(async () => undefined),
}));

vi.mock('@gitgazer/backend-core/config', () => ({
    default: {get: configGetMock},
    loadConfig: vi.fn(),
}));
vi.mock('@gitgazer/backend-core/bootstrap', () => ({}));
vi.mock('@gitgazer/db/client', async (importOriginal) => ({...(await importOriginal<object>()), initDb: vi.fn()}));
vi.mock('@/domains/github-app/github-app.controller', () => ({handleGithubAppEvent: handleGithubAppEventMock}));

function signatureFor(payload: string | NodeJS.ArrayBufferView, secret: string) {
    const hmac = crypto.createHmac('sha256', secret);
    return 'sha256=' + hmac.update(payload).digest('hex');
}

async function post(headers: Record<string, string>, body?: string) {
    const {verifyGithubAppSignature} = await import('./github-app.middleware');
    const next = vi.fn();
    const app = new Hono<AppEnv>();
    app.post('/api/github/webhook', verifyGithubAppSignature, async (c) => {
        next();
        return c.json({received: await c.req.json()});
    });
    const res = await testRequest(app, 'POST', '/api/github/webhook', {headers, body});
    return {res, next, json: await res.json()};
}

describe('verifyGithubAppSignature middleware', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        configGetMock.mockClear();
    });

    it('calls next for a plain body with a valid signature', async () => {
        const payload = JSON.stringify({action: 'created'});

        const {res, next} = await post({'x-hub-signature-256': signatureFor(payload, 'shh')}, payload);

        expect(res.status).toBe(200);
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('throws BadRequestError when signature or payload is missing', async () => {
        const missingSig = await post({}, '{}');
        expect(missingSig.res.status).toBe(400);
        expect(missingSig.json).toMatchObject({message: 'Missing signature or payload'});

        const missingBody = await post({'x-hub-signature-256': 'sha256=deadbeef'});
        expect(missingBody.res.status).toBe(400);
        expect(missingBody.json).toMatchObject({message: 'Missing signature or payload'});
    });

    it('throws UnauthorizedError for an invalid signature', async () => {
        const payload = JSON.stringify({action: 'created'});
        const good = signatureFor(payload, 'shh');
        const bad = good.slice(0, -1) + (good.endsWith('0') ? '1' : '0');

        const {res, next, json} = await post({'x-hub-signature-256': bad}, payload);

        expect(res.status).toBe(401);
        expect(json).toMatchObject({message: 'Invalid signature'});
        expect(next).not.toHaveBeenCalled();
    });

    it('verifies the signature over the raw bytes and still lets the handler parse JSON', async () => {
        const payload = '{ "name" :  "Zoë \u00fc \u2603 😀",\n   "n":1.0 }';
        expect(payload).not.toBe(JSON.stringify(JSON.parse(payload)));

        const {res, next, json} = await post({'x-hub-signature-256': signatureFor(Buffer.from(payload, 'utf-8'), 'shh')}, payload);

        expect(res.status).toBe(200);
        expect(next).toHaveBeenCalledTimes(1);
        expect(json).toEqual({received: {name: 'Zoë ü ☃ 😀', n: 1}});
    });
});
