const ALLOWED_HOSTS = new Set(['api.github.com', 'github.com', 'hooks.slack.com', 'slack.com', 'api.slack.com']);

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Response headers the proxy forwards back to the caller. Critically includes
 * the GitHub rate-limit headers so in-VPC callers (e.g. the backfill worker)
 * can detect limits and back off — without these, every rate-limited response
 * looks like a naked 403/429 and the client's retry logic is blind.
 *
 * Deliberately excludes body-framing / hop-by-hop headers
 * (`content-encoding`, `content-length`, `transfer-encoding`): the body is
 * returned already-decoded as a string, so forwarding those would misrepresent
 * it to the caller. `content-type` is always set separately below.
 */
const FORWARDED_RESPONSE_HEADERS = [
    'retry-after',
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'x-ratelimit-reset',
    'x-ratelimit-used',
    'x-ratelimit-resource',
];

export type ProxyRequest = {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
};

export type ProxyResponse = {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
};

export const handler = async (event: ProxyRequest): Promise<ProxyResponse> => {
    if (!event.url || !event.method) {
        return {statusCode: 400, headers: {}, body: JSON.stringify({error: 'Missing required fields: url, method'})};
    }

    let targetUrl: URL;
    try {
        targetUrl = new URL(event.url);
    } catch {
        return {statusCode: 400, headers: {}, body: JSON.stringify({error: 'Invalid URL'})};
    }

    if (targetUrl.protocol !== 'https:') {
        return {statusCode: 400, headers: {}, body: JSON.stringify({error: 'Only HTTPS targets allowed'})};
    }

    if (!ALLOWED_HOSTS.has(targetUrl.hostname)) {
        return {statusCode: 403, headers: {}, body: JSON.stringify({error: `Host not allowed: ${targetUrl.hostname}`})};
    }

    if (event.body && event.body.length > MAX_BODY_SIZE) {
        return {statusCode: 413, headers: {}, body: JSON.stringify({error: 'Request body too large'})};
    }

    const headers: Record<string, string> = {};
    if (event.headers) {
        for (const [key, value] of Object.entries(event.headers)) {
            const lower = key.toLowerCase();
            if (lower === 'host' || lower === 'transfer-encoding') continue;
            headers[key] = value;
        }
    }

    try {
        const response = await fetch(event.url, {
            method: event.method,
            headers,
            body: event.method !== 'GET' && event.method !== 'HEAD' ? event.body : undefined,
        });

        const responseBody = await response.text();

        const responseHeaders: Record<string, string> = {'content-type': response.headers.get('content-type') ?? 'application/json'};
        for (const name of FORWARDED_RESPONSE_HEADERS) {
            const value = response.headers.get(name);
            if (value !== null) responseHeaders[name] = value;
        }

        return {
            statusCode: response.status,
            headers: responseHeaders,
            body: responseBody,
        };
    } catch (err) {
        return {
            statusCode: 502,
            headers: {},
            body: JSON.stringify({error: 'Upstream request failed', message: err instanceof Error ? err.message : String(err)}),
        };
    }
};
