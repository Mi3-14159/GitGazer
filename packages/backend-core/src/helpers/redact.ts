import {isUtf8} from 'buffer';

const REDACTED = '[REDACTED]';
const REDACTED_BINARY_BODY = '[REDACTED binary body]';

const SENSITIVE_HEADERS = new Set(['authorization', 'proxy-authorization', 'cookie', 'set-cookie']);
const SENSITIVE_QUERY_PARAMS = new Set(['code', 'state', 'token', 'code_verifier', 'refresh_token']);
const SENSITIVE_BODY_KEYS = new Set([
    'code',
    'code_verifier',
    'refresh_token',
    'access_token',
    'id_token',
    'client_secret',
    'secret',
    'token',
    'password',
]);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const redactRecordKeys = (record: Record<string, unknown>, sensitive: Set<string>): Record<string, unknown> =>
    Object.fromEntries(Object.entries(record).map(([key, value]) => [key, sensitive.has(key.toLowerCase()) ? REDACTED : value]));

const redactCookie = (cookie: unknown): unknown => {
    if (typeof cookie !== 'string') return cookie;
    const nameEnd = cookie.indexOf('=');
    if (nameEnd === -1) return REDACTED;
    const attributesStart = cookie.indexOf(';', nameEnd);
    const attributes = attributesStart === -1 ? '' : cookie.slice(attributesStart);
    return `${cookie.slice(0, nameEnd + 1)}${REDACTED}${attributes}`;
};

const redactSearchParams = (raw: string, sensitive: Set<string>): string => {
    const params = new URLSearchParams(raw);
    const keys = [...params.keys()].filter((key) => sensitive.has(key.toLowerCase()));
    if (keys.length === 0) return raw;
    keys.forEach((key) => params.set(key, REDACTED));
    return params.toString();
};

const redactText = (text: string): string => {
    try {
        return JSON.stringify(JSON.parse(text), (key, value: unknown) => (SENSITIVE_BODY_KEYS.has(key.toLowerCase()) ? REDACTED : value));
    } catch {
        return redactSearchParams(text, SENSITIVE_BODY_KEYS);
    }
};

const hasContentEncoding = (headers: unknown): boolean =>
    isRecord(headers) && Object.keys(headers).some((key) => key.toLowerCase() === 'content-encoding');

const redactBody = (body: string, isBase64Encoded: boolean): string => {
    if (!isBase64Encoded) return redactText(body);
    const decoded = Buffer.from(body, 'base64');
    if (!isUtf8(decoded)) return REDACTED_BINARY_BODY;
    return Buffer.from(redactText(decoded.toString('utf-8')), 'utf-8').toString('base64');
};

const KEYED_FIELDS: [string, Set<string>][] = [
    ['headers', SENSITIVE_HEADERS],
    ['multiValueHeaders', SENSITIVE_HEADERS],
    ['queryStringParameters', SENSITIVE_QUERY_PARAMS],
    ['multiValueQueryStringParameters', SENSITIVE_QUERY_PARAMS],
];

// Only masks the API Gateway event/result envelope; anything else passes through unchanged.
export const redactForLog = <T>(value: T): T => {
    if (!isRecord(value)) return value;

    const redacted: Record<string, unknown> = {...value};

    for (const [key, sensitive] of KEYED_FIELDS) {
        if (isRecord(redacted[key])) redacted[key] = redactRecordKeys(redacted[key], sensitive);
    }
    if (typeof redacted.rawQueryString === 'string') {
        redacted.rawQueryString = redactSearchParams(redacted.rawQueryString, SENSITIVE_QUERY_PARAMS);
    }
    if (Array.isArray(redacted.cookies)) {
        redacted.cookies = redacted.cookies.map(redactCookie);
    }
    if (typeof redacted.body === 'string' && redacted.body.length > 0) {
        redacted.body = hasContentEncoding(value.headers) ? REDACTED_BINARY_BODY : redactBody(redacted.body, redacted.isBase64Encoded === true);
    }

    return redacted as T;
};
