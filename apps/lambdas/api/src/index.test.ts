import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const SLACK_URL = 'https://hooks.slack.com/services/T000/B000/XXXX';

const mocks = vi.hoisted(() => ({
    logger: {resetKeys: vi.fn(), addContext: vi.fn(), logEventIfEnabled: vi.fn(), debug: vi.fn()},
    startServer: vi.fn(async () => ({})),
}));

vi.mock('@gitgazer/backend-core/bootstrap', () => ({}));
vi.mock('@gitgazer/backend-core/config', () => ({loadConfig: vi.fn()}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => mocks.logger}));
vi.mock('@gitgazer/db/client', () => ({initDb: vi.fn()}));
vi.mock('@/server', () => ({startServer: mocks.startServer}));
vi.mock('@/app', async () => {
    const {Hono} = await import('hono');
    const app = new Hono();
    app.patch('/api/integrations/:integrationId/handles/:handleId', (c) => c.json({handleId: 'h-1', name: 'Ops', url: SLACK_URL}));
    return {initApp: async () => app};
});

import {handler} from '@/index';
import {apiGatewayEvent} from '@/shared/hono/test-request';

describe('api handler', () => {
    it('logs the handle response without the webhook URL but returns it unchanged', async () => {
        const event = apiGatewayEvent('PATCH', '/api/integrations/i-1/handles/h-1', {body: JSON.stringify({url: SLACK_URL})});

        const result = await handler(event, {} as Parameters<typeof handler>[1]);

        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body!)).toEqual({handleId: 'h-1', name: 'Ops', url: SLACK_URL});
        expect(mocks.logger.debug).toHaveBeenCalledWith('result', expect.anything());
        expect(JSON.stringify(mocks.logger.debug.mock.calls)).not.toContain('hooks.slack.com');
        expect(JSON.stringify(mocks.logger.logEventIfEnabled.mock.calls)).not.toContain('hooks.slack.com');
    });
});

describe('api bundle entrypoint', () => {
    beforeEach(() => {
        vi.resetModules();
        mocks.startServer.mockClear();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('starts the http server when AWS_LAMBDA_HTTP_ENDPOINT is set', async () => {
        vi.stubEnv('AWS_LAMBDA_HTTP_ENDPOINT', '0.0.0.0:3000');
        await import('@/index');
        expect(mocks.startServer).toHaveBeenCalledTimes(1);
    });

    it('only exports the handler on an Event Function', async () => {
        vi.stubEnv('AWS_LAMBDA_HTTP_ENDPOINT', '');
        const mod = await import('@/index');
        expect(mocks.startServer).not.toHaveBeenCalled();
        expect(mod.handler).toBeTypeOf('function');
    });
});
