import type {APIGatewayProxyEventV2} from 'aws-lambda';
import {describe, expect, it} from 'vitest';
import {redactHandleRouteBody} from '@/shared/redact-handle-event';

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
