import type {APIGatewayProxyEventV2} from 'aws-lambda';

type Route = {method: string; path: RegExp};

const REDACTED = '[REDACTED]';

const HANDLE_ROUTES: Route[] = [
    {method: 'POST', path: /^\/api\/integrations\/[^/]+\/apps\/[^/]+\/handles\/?$/},
    {method: 'PATCH', path: /^\/api\/integrations\/[^/]+\/handles\/[^/]+\/?$/},
];

const APP_RESULT_ROUTES: Route[] = [
    ...HANDLE_ROUTES,
    {method: 'GET', path: /^\/api\/integrations\/[^/]+\/apps\/?$/},
    {method: 'POST', path: /^\/api\/integrations\/[^/]+\/apps\/?$/},
];

const REDACTED_RESULT_ROUTES: Route[] = [{method: 'GET', path: /^\/api\/integrations\/[^/]+\/apps\/[^/]+\/slack\/channels\/?$/}];

const RESULT_SECRET_KEYS = new Set(['url', 'secret']);

const matchesRoute = (event: APIGatewayProxyEventV2, routes: Route[]): boolean => {
    const method = event.requestContext?.http?.method?.toUpperCase();
    const path = event.rawPath ?? event.requestContext?.http?.path ?? '';
    return routes.some((route) => route.method === method && route.path.test(path));
};

// The generic redactor only knows OAuth keys; these bodies carry Slack webhook URLs, which are credentials.
export const redactHandleRouteBody = (event: APIGatewayProxyEventV2): APIGatewayProxyEventV2 => {
    if (!matchesRoute(event, HANDLE_ROUTES) || !event.body) return event;
    return {...event, body: REDACTED, isBase64Encoded: false};
};

const redactResultBody = (body: string, isBase64Encoded: boolean): string => {
    try {
        const text = isBase64Encoded ? Buffer.from(body, 'base64').toString('utf-8') : body;
        return JSON.stringify(JSON.parse(text), (key, value: unknown) =>
            RESULT_SECRET_KEYS.has(key) && typeof value === 'string' ? REDACTED : value,
        );
    } catch {
        // Compressed or otherwise unreadable, so nothing in it can be masked selectively
        return REDACTED;
    }
};

// App and handle responses carry Slack webhook URLs (and the GitHub secret) for admins; the generic redactor misses `url`.
export const redactHandleRouteResult = <T extends {body?: string; isBase64Encoded?: boolean}>(event: APIGatewayProxyEventV2, result: T): T => {
    // Channel lists name private channels and hold nothing needed to debug a request
    if (matchesRoute(event, REDACTED_RESULT_ROUTES) && result.body) return {...result, body: REDACTED, isBase64Encoded: false};
    if (!matchesRoute(event, APP_RESULT_ROUTES) || !result.body) return result;
    return {...result, body: redactResultBody(result.body, result.isBase64Encoded === true), isBase64Encoded: false};
};
