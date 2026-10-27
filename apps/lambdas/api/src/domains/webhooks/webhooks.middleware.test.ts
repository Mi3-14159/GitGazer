import type {AppEnv} from '@/shared/hono/env';
import {testRequest} from '@/shared/hono/test-request';
import type {APIGatewayProxyEventV2, Context} from 'aws-lambda';
import * as crypto from 'crypto';
import {Hono} from 'hono';
import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@gitgazer/backend-core/config', () => ({default: {get: vi.fn(() => ['https://app.example.com'])}, loadConfig: vi.fn()}));
vi.mock('@gitgazer/db/client', () => {
    return {
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

async function post(headers: Record<string, string>, body?: string, path = '/test/int-1') {
    const {verifyGithubSign} = await import('./webhooks.middleware');
    const next = vi.fn();
    const app = new Hono<AppEnv>();
    app.post('/test/:integrationId', verifyGithubSign, async (c) => {
        next();
        return c.json({received: await c.req.json()});
    });
    const res = await testRequest(app, 'POST', path, {headers, body});
    return {res, next, json: await res.json()};
}

const apiGatewayEvent = (path: string, headers: Record<string, string>, body: string, isBase64Encoded: boolean): APIGatewayProxyEventV2 => ({
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: '',
    headers: {host: 'api.example.com', ...headers},
    requestContext: {
        accountId: '123',
        apiId: 'api',
        domainName: 'api.example.com',
        domainPrefix: 'api',
        http: {method: 'POST', path, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'GitHub-Hookshot'},
        requestId: 'req-1',
        routeKey: '$default',
        stage: '$default',
        time: '',
        timeEpoch: 0,
    },
    body,
    isBase64Encoded,
});

describe('verifyGithubSign middleware', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
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

    it('accepts a base64-encoded API Gateway body', async () => {
        await mockSettings([{appId: 'app-1', secret: 'shh', orgSyncDefaultRole: 'viewer'}]);
        const {createApp} = await import('@/shared/router');

        const rawBody = Buffer.from('{ "zen":  "Zoë ☃" }', 'utf-8');
        const event = apiGatewayEvent(
            '/api/import/int-1',
            {'x-hub-signature-256': signatureFor(rawBody, 'shh'), 'x-github-event': 'ping'},
            rawBody.toString('base64'),
            true,
        );

        const res = await createApp().resolve(event, {} as Context);

        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body!)).toEqual({message: 'ok'});
    });

    it('rejects a base64-encoded body whose signature was computed over the encoded text', async () => {
        await mockSettings([{appId: 'app-1', secret: 'shh', orgSyncDefaultRole: 'viewer'}]);
        const {createApp} = await import('@/shared/router');

        const encoded = Buffer.from(JSON.stringify({deploy: true}), 'utf-8').toString('base64');
        const event = apiGatewayEvent(
            '/api/import/int-1',
            {'x-hub-signature-256': signatureFor(encoded, 'shh'), 'x-github-event': 'ping'},
            encoded,
            true,
        );

        const res = await createApp().resolve(event, {} as Context);

        expect(res.statusCode).toBe(401);
        expect(JSON.parse(res.body!)).toMatchObject({message: 'Invalid signature'});
    });
});
