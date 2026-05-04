import {beforeEach, describe, expect, it, vi} from 'vitest';

import {handler} from './http-proxy';

describe('http-proxy handler', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 400 when required fields are missing', async () => {
        const result = await handler({url: '', method: ''});

        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body).error).toContain('Missing required fields');
    });

    it('returns 403 for a host not on the allowlist', async () => {
        const result = await handler({url: 'https://example.com', method: 'GET'});

        expect(result.statusCode).toBe(403);
        expect(JSON.parse(result.body).error).toContain('Host not allowed');
    });

    it('forwards allowed requests and strips unsafe headers', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response('{"ok":true}', {
                status: 202,
                headers: {'content-type': 'application/json'},
            }),
        );
        vi.stubGlobal('fetch', fetchMock);

        const result = await handler({
            url: 'https://api.github.com/user',
            method: 'POST',
            headers: {
                host: 'malicious',
                'transfer-encoding': 'chunked',
                authorization: 'Bearer abc',
            },
            body: '{"ping":"pong"}',
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith('https://api.github.com/user', {
            method: 'POST',
            headers: {authorization: 'Bearer abc'},
            body: '{"ping":"pong"}',
        });

        expect(result.statusCode).toBe(202);
        expect(result.headers['content-type']).toBe('application/json');
        expect(result.body).toBe('{"ok":true}');
    });

    it('returns 502 when upstream fetch throws', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network failed')));

        const result = await handler({url: 'https://api.github.com/user', method: 'GET'});

        expect(result.statusCode).toBe(502);
        expect(JSON.parse(result.body).error).toBe('Upstream request failed');
    });
});
