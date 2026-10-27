import {afterAll, afterEach, describe, expect, it, vi} from 'vitest';

// Powertools reads both when the logger is created: cold starts are only reported on on-demand environments, and dev mode logs through console
vi.hoisted(() => {
    vi.stubEnv('AWS_LAMBDA_INITIALIZATION_TYPE', 'on-demand');
    vi.stubEnv('POWERTOOLS_DEV', 'false');
});
vi.mock('@gitgazer/backend-core/logger', async (importOriginal) => importOriginal());
vi.mock('@gitgazer/backend-core/bootstrap', () => ({}));
vi.mock('@gitgazer/backend-core/config', () => ({default: {get: vi.fn(() => [])}, loadConfig: vi.fn()}));
vi.mock('@gitgazer/db/client', () => ({db: {}, initDb: vi.fn(), withRlsTransaction: vi.fn()}));
vi.mock('@/shared/middleware/authentication', () => ({authenticate: async (_c: unknown, next: () => Promise<void>) => next()}));
vi.mock('@/domains/overview/overview.routes', async () => {
    const {Hono} = await import('hono');
    const {getLogger} = await import('@gitgazer/backend-core/logger');
    return {
        default: new Hono().get('/log', (c) => {
            getLogger().info('route log');
            return c.json({ok: true});
        }),
    };
});

import {handler} from '@/index';
import {apiGatewayEvent} from '@/shared/hono/test-request';

const lambdaContext = (awsRequestId: string) =>
    ({
        awsRequestId,
        functionName: 'gitgazer-api',
        functionVersion: '$LATEST',
        invokedFunctionArn: 'arn:aws:lambda:eu-central-1:000000000000:function:gitgazer-api',
        memoryLimitInMB: '512',
    }) as Parameters<typeof handler>[1];

describe('api handler logging', () => {
    afterAll(() => {
        vi.unstubAllEnvs();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('logs like a plain Lambda: cold start only once and no extra request id', async () => {
        const lines: string[] = [];
        vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
            lines.push(String(chunk));
            return true;
        });

        await handler(apiGatewayEvent('GET', '/api/log'), lambdaContext('invocation-1'));
        await handler(apiGatewayEvent('GET', '/api/log'), lambdaContext('invocation-2'));

        const routeLogs = lines.map((line) => JSON.parse(line)).filter((log) => log.message === 'route log');
        expect(routeLogs).toMatchObject([
            {function_request_id: 'invocation-1', cold_start: true},
            {function_request_id: 'invocation-2', cold_start: false},
        ]);
        expect(routeLogs.every((log) => !('requestId' in log))).toBe(true);
    });
});
