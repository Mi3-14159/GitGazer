import {ProxyRequest, ProxyResponse} from '@gitgazer/backend-core/clients/proxy.types';

const ALLOWED_HOSTS = new Set(['api.github.com', 'github.com', 'hooks.slack.com', 'slack.com', 'api.slack.com']);

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB

const TRUNCATE_TAIL_HEADER = 'x-gitgazer-truncate-tail';

// Lambda's 6 MB response limit applies to the JSON-serialized payload, where a control byte grows to six (\u001b);
// budget for that worst case and leave room for the headers and envelope.
const MAX_TAIL_BYTES = Math.floor((5 * 1024 * 1024) / 6);

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

/** Streams the body, keeping only the last MAX_TAIL_BYTES in memory, because a job log's error is at its end. */
const readTail = async (response: Response): Promise<{body: string; truncated: boolean}> => {
    if (!response.body) {
        return {body: await response.text(), truncated: false};
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    let truncated = false;

    for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.byteLength;
        while (chunks.length > 1 && size - chunks[0].byteLength >= MAX_TAIL_BYTES) {
            size -= chunks.shift()!.byteLength;
            truncated = true;
        }
    }

    let tail = Buffer.concat(chunks);
    if (tail.byteLength > MAX_TAIL_BYTES) {
        tail = tail.subarray(tail.byteLength - MAX_TAIL_BYTES);
        truncated = true;
    }

    return {body: new TextDecoder('utf-8').decode(tail), truncated};
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
    let truncateTail = false;
    if (event.headers) {
        for (const [key, value] of Object.entries(event.headers)) {
            const lower = key.toLowerCase();
            if (lower === TRUNCATE_TAIL_HEADER) {
                truncateTail = value.toLowerCase() === 'true';
                continue;
            }
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

        const {body: responseBody, truncated} = truncateTail ? await readTail(response) : {body: await response.text(), truncated: false};

        const responseHeaders: Record<string, string> = {'content-type': response.headers.get('content-type') ?? 'application/json'};
        for (const name of FORWARDED_RESPONSE_HEADERS) {
            const value = response.headers.get(name);
            if (value !== null) responseHeaders[name] = value;
        }

        if (truncated) responseHeaders['x-gitgazer-body-truncated'] = 'true';

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
