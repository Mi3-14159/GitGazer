import type {APIGatewayProxyEventV2} from 'aws-lambda';

const HANDLE_ROUTES: {method: string; path: RegExp}[] = [
    {method: 'POST', path: /^\/api\/integrations\/[^/]+\/apps\/[^/]+\/handles\/?$/},
    {method: 'PATCH', path: /^\/api\/integrations\/[^/]+\/handles\/[^/]+\/?$/},
];

// The generic redactor only knows OAuth keys; these bodies carry Slack webhook URLs, which are credentials.
export const redactHandleRouteBody = (event: APIGatewayProxyEventV2): APIGatewayProxyEventV2 => {
    const method = event.requestContext?.http?.method?.toUpperCase();
    const path = event.rawPath ?? event.requestContext?.http?.path ?? '';
    const isHandleRoute = HANDLE_ROUTES.some((route) => route.method === method && route.path.test(path));
    if (!isHandleRoute || !event.body) return event;
    return {...event, body: '[REDACTED]', isBase64Encoded: false};
};
