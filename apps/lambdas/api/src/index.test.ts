import type {APIGatewayProxyEventV2, Context} from 'aws-lambda';
import {describe, expect, it, vi} from 'vitest';

const SLACK_URL = 'https://hooks.slack.com/services/T000/B000/XXXX';

const mocks = vi.hoisted(() => ({
    logger: {resetKeys: vi.fn(), addContext: vi.fn(), logEventIfEnabled: vi.fn(), debug: vi.fn()},
    resolve: vi.fn(),
}));

vi.mock('@gitgazer/backend-core/bootstrap', () => ({}));
vi.mock('@gitgazer/backend-core/config', () => ({loadConfig: vi.fn()}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => mocks.logger}));
vi.mock('@gitgazer/db/client', () => ({initDb: vi.fn()}));
vi.mock('@/shared/router', () => ({createApp: () => ({resolve: mocks.resolve})}));

describe('api handler', () => {
    it('logs the handle response without the webhook URL but returns it unchanged', async () => {
        const response = {statusCode: 200, body: JSON.stringify({handleId: 'h-1', name: 'Ops', url: SLACK_URL}), isBase64Encoded: false};
        mocks.resolve.mockResolvedValue(response);
        const {handler} = await import('@/index');
        const event = {
            rawPath: '/api/integrations/i-1/handles/h-1',
            requestContext: {http: {method: 'PATCH', path: '/api/integrations/i-1/handles/h-1'}},
        } as unknown as APIGatewayProxyEventV2;

        const result = await handler(event, {} as Context);

        expect(result).toBe(response);
        expect(mocks.logger.debug).toHaveBeenCalledWith('result', expect.anything());
        expect(JSON.stringify(mocks.logger.debug.mock.calls)).not.toContain('hooks.slack.com');
    });
});
