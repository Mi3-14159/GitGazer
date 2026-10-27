import {describe, expect, it, vi} from 'vitest';

const SLACK_URL = 'https://hooks.slack.com/services/T000/B000/XXXX';

const mocks = vi.hoisted(() => ({
    logger: {resetKeys: vi.fn(), addContext: vi.fn(), logEventIfEnabled: vi.fn(), debug: vi.fn()},
}));

vi.mock('@gitgazer/backend-core/bootstrap', () => ({}));
vi.mock('@gitgazer/backend-core/config', () => ({loadConfig: vi.fn()}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => mocks.logger}));
vi.mock('@gitgazer/db/client', () => ({initDb: vi.fn()}));
vi.mock('@/app', async () => {
    const {Hono} = await import('hono');
    const app = new Hono();
    app.patch('/api/integrations/:integrationId/handles/:handleId', (c) => c.json({handleId: 'h-1', name: 'Ops', url: SLACK_URL}));
    return {createApp: () => app};
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
