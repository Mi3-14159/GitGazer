import {beforeEach, describe, expect, it, vi} from 'vitest';

const {mockConfigGet, mockFetchWithRetry, mockSend} = vi.hoisted(() => ({
    mockConfigGet: vi.fn(),
    mockFetchWithRetry: vi.fn(),
    mockSend: vi.fn(),
}));

vi.mock('@/shared/config', () => ({
    default: {
        get: mockConfigGet,
    },
}));

vi.mock('@/shared/helpers/fetch', () => ({
    fetchWithRetry: mockFetchWithRetry,
}));

vi.mock('@aws-sdk/client-lambda', () => {
    class LambdaClient {
        send(...args: unknown[]) {
            return mockSend(...args);
        }
    }

    class InvokeCommand {
        input: unknown;
        constructor(input: unknown) {
            this.input = input;
        }
    }

    return {LambdaClient, InvokeCommand};
});

import {proxyFetch} from './proxy-fetch';

describe('proxyFetch', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('falls back to fetchWithRetry when proxy is disabled', async () => {
        const fallbackResponse = new Response('ok', {status: 200});
        mockConfigGet.mockReturnValue('');
        mockFetchWithRetry.mockResolvedValue(fallbackResponse);

        const result = await proxyFetch('https://example.com', {method: 'GET'});

        expect(mockFetchWithRetry).toHaveBeenCalledWith('https://example.com', {method: 'GET'});
        expect(mockSend).not.toHaveBeenCalled();
        expect(result).toBe(fallbackResponse);
    });

    it('invokes proxy lambda and returns upstream response', async () => {
        mockConfigGet.mockReturnValue('gitgazer-http-proxy-default');
        mockSend.mockResolvedValue({
            Payload: Buffer.from(
                JSON.stringify({
                    statusCode: 201,
                    headers: {'content-type': 'application/json'},
                    body: '{"ok":true}',
                }),
            ),
        });

        const result = await proxyFetch('https://api.github.com/user', {
            method: 'POST',
            headers: {
                authorization: 'Bearer token',
                'content-type': 'application/json',
            },
            body: JSON.stringify({hello: 'world'}),
        });

        expect(mockFetchWithRetry).not.toHaveBeenCalled();
        expect(mockSend).toHaveBeenCalledTimes(1);

        const command = mockSend.mock.calls[0][0] as {input: {FunctionName: string; Payload: string}};
        expect(command.input.FunctionName).toBe('gitgazer-http-proxy-default');

        const payload = JSON.parse(command.input.Payload);
        expect(payload).toEqual({
            url: 'https://api.github.com/user',
            method: 'POST',
            headers: {
                authorization: 'Bearer token',
                'content-type': 'application/json',
            },
            body: '{"hello":"world"}',
        });

        expect(result.status).toBe(201);
        expect(await result.text()).toBe('{"ok":true}');
    });

    it('throws when proxy lambda returns function error', async () => {
        mockConfigGet.mockReturnValue('gitgazer-http-proxy-default');
        mockSend.mockResolvedValue({
            FunctionError: 'Unhandled',
            Payload: Buffer.from('something bad happened'),
        });

        await expect(proxyFetch('https://api.github.com/user')).rejects.toThrow('Proxy Lambda error: something bad happened');
    });
});
