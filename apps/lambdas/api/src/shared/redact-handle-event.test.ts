import type {APIGatewayProxyEventV2} from 'aws-lambda';
import {describe, expect, it} from 'vitest';
import {redactHandleRouteBody, redactHandleRouteResult} from '@/shared/redact-handle-event';

const URL_BODY = JSON.stringify({name: 'Ops', url: 'https://hooks.slack.com/services/T000/B000/XXXX'});

const event = (method: string, rawPath: string, body: string | undefined = URL_BODY, isBase64Encoded = false): APIGatewayProxyEventV2 =>
    ({
        rawPath,
        body,
        isBase64Encoded,
        requestContext: {http: {method, path: rawPath}},
    }) as unknown as APIGatewayProxyEventV2;

describe('redactHandleRouteBody', () => {
    it.each([
        ['POST', '/api/integrations/i-1/apps/a-1/handles'],
        ['PATCH', '/api/integrations/i-1/handles/h-1'],
    ])('removes the webhook URL from %s %s', (method, path) => {
        const logged = redactHandleRouteBody(event(method, path));
        expect(JSON.stringify(logged)).not.toContain('hooks.slack.com');
        expect(logged.body).toBe('[REDACTED]');
    });

    it('also covers a base64 encoded body', () => {
        const logged = redactHandleRouteBody(event('POST', '/api/integrations/i-1/apps/a-1/handles', Buffer.from(URL_BODY).toString('base64'), true));
        expect(logged.body).toBe('[REDACTED]');
        expect(logged.isBase64Encoded).toBe(false);
    });

    it.each([
        ['POST', '/api/integrations/i-1/apps'],
        ['DELETE', '/api/integrations/i-1/handles/h-1'],
        ['GET', '/api/integrations/i-1/apps/a-1/handles'],
        ['POST', '/api/integrations/i-1/rules'],
    ])('leaves %s %s unchanged', (method, path) => {
        const input = event(method, path);
        expect(redactHandleRouteBody(input)).toBe(input);
    });

    it('does not modify the original event', () => {
        const input = event('POST', '/api/integrations/i-1/apps/a-1/handles');
        redactHandleRouteBody(input);
        expect(input.body).toBe(URL_BODY);
    });
});

const SLACK_URL = 'https://hooks.slack.com/services/T000/B000/XXXX';
const SECRET = 's3cret-value';

const result = (body: unknown) => ({
    statusCode: 200,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
    isBase64Encoded: false,
});

describe('redactHandleRouteResult', () => {
    const appsList = [
        {appId: 'app-g', type: 'github', createdAt: '', settings: {secret: SECRET, orgSyncDefaultRole: 'viewer'}},
        {appId: 'app-w', type: 'webhook', createdAt: '', handles: [{handleId: 'h-1', appId: 'app-w', name: 'Ops', url: SLACK_URL, ruleCount: 1}]},
    ];
    const handle = {handleId: 'h-1', appId: 'app-w', name: 'Ops', url: SLACK_URL, ruleCount: 0};

    it.each([
        ['GET', '/api/integrations/i-1/apps', appsList],
        ['POST', '/api/integrations/i-1/apps', appsList[0]],
        ['POST', '/api/integrations/i-1/apps/a-1/handles', handle],
        ['PATCH', '/api/integrations/i-1/handles/h-1', handle],
    ])('masks webhook URLs and the secret in the %s %s response', (method, path, body) => {
        const logged = redactHandleRouteResult(event(method, path), result(body));

        expect(logged.body).not.toContain('hooks.slack.com');
        expect(logged.body).not.toContain(SECRET);
        expect(logged.statusCode).toBe(200);
    });

    it('keeps the rest of the GET apps response readable', () => {
        const logged = redactHandleRouteResult(event('GET', '/api/integrations/i-1/apps'), result(appsList));

        expect(JSON.parse(logged.body!)).toEqual([
            {...appsList[0], settings: {secret: '[REDACTED]', orgSyncDefaultRole: 'viewer'}},
            {...appsList[1], handles: [{...handle, ruleCount: 1, url: '[REDACTED]'}]},
        ]);
    });

    it('decodes a base64 body before masking it', () => {
        const encoded = {...result(handle), body: Buffer.from(JSON.stringify(handle)).toString('base64'), isBase64Encoded: true};

        const logged = redactHandleRouteResult(event('PATCH', '/api/integrations/i-1/handles/h-1'), encoded);

        expect(logged.isBase64Encoded).toBe(false);
        expect(JSON.parse(logged.body!)).toMatchObject({name: 'Ops', url: '[REDACTED]'});
    });

    it('drops a body it cannot parse, such as a compressed one', () => {
        const compressed = {...result(handle), headers: {'Content-Encoding': 'gzip'}, body: 'H4sIAAAAAAAAA6tWyk', isBase64Encoded: true};

        const logged = redactHandleRouteResult(event('POST', '/api/integrations/i-1/apps/a-1/handles'), compressed);

        expect(logged.body).toBe('[REDACTED]');
    });

    it('does not modify the response that is returned to the client', () => {
        const response = result(handle);

        redactHandleRouteResult(event('PATCH', '/api/integrations/i-1/handles/h-1'), response);

        expect(response.body).toContain(SLACK_URL);
    });

    it('drops the Slack channel list, which names private channels', () => {
        const logged = redactHandleRouteResult(
            event('GET', '/api/integrations/i-1/apps/a-1/slack/channels'),
            result([{id: 'C1', name: 'secret-project', isPrivate: true}]),
        );

        expect(logged.body).toBe('[REDACTED]');
    });

    it.each([
        ['GET', '/api/integrations/i-1/rules'],
        ['DELETE', '/api/integrations/i-1/handles/h-1'],
        ['GET', '/api/integrations'],
    ])('leaves the %s %s response unchanged', (method, path) => {
        const response = result({url: 'https://example.com'});
        expect(redactHandleRouteResult(event(method, path), response)).toBe(response);
    });
});
