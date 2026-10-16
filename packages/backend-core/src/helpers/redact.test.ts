import {gzipSync} from 'zlib';
import {describe, expect, it} from 'vitest';
import {redactForLog} from './redact';

const toBase64 = (text: string) => Buffer.from(text, 'utf-8').toString('base64');
const fromBase64 = (text: string) => Buffer.from(text, 'base64').toString('utf-8');

describe('redactForLog', () => {
    it('masks credential headers regardless of case and keeps the rest', () => {
        const result = redactForLog({
            headers: {Authorization: 'Bearer abc', cookie: 'accessToken=abc', 'Set-Cookie': 'a=b', 'content-type': 'application/json'},
            multiValueHeaders: {authorization: ['Bearer abc']},
        });

        expect(result.headers).toEqual({
            Authorization: '[REDACTED]',
            cookie: '[REDACTED]',
            'Set-Cookie': '[REDACTED]',
            'content-type': 'application/json',
        });
        expect(result.multiValueHeaders).toEqual({authorization: '[REDACTED]'});
    });

    it('keeps cookie names and attributes but masks their values', () => {
        const result = redactForLog({cookies: ['accessToken=abc', 'refreshToken=def; HttpOnly; Secure; Path=/', 'malformed']});

        expect(result.cookies).toEqual(['accessToken=[REDACTED]', 'refreshToken=[REDACTED]; HttpOnly; Secure; Path=/', '[REDACTED]']);
    });

    it('masks OAuth and websocket query parameters in parsed and raw form', () => {
        const result = redactForLog({
            queryStringParameters: {code: 'c', state: 's', token: 't', redirect_url: '/home'},
            rawQueryString: 'code=c&state=s&redirect_url=%2Fhome',
        });

        expect(result.queryStringParameters).toEqual({code: '[REDACTED]', state: '[REDACTED]', token: '[REDACTED]', redirect_url: '/home'});
        expect(result.rawQueryString).toBe('code=%5BREDACTED%5D&state=%5BREDACTED%5D&redirect_url=%2Fhome');
    });

    it('leaves a raw query string without sensitive parameters untouched', () => {
        expect(redactForLog({rawQueryString: 'cursor=%7B%7D&limit=10'}).rawQueryString).toBe('cursor=%7B%7D&limit=10');
    });

    it('masks token fields at any depth of a JSON body', () => {
        const body = JSON.stringify({access_token: 'a', nested: [{refresh_token: 'r', keep: 1}], token_type: 'Bearer'});

        const result = redactForLog({body});

        expect(JSON.parse(result.body)).toEqual({access_token: '[REDACTED]', nested: [{refresh_token: '[REDACTED]', keep: 1}], token_type: 'Bearer'});
    });

    it('masks secrets in a form-encoded body', () => {
        const body = 'grant_type=authorization_code&client_id=id&client_secret=s&code=c&code_verifier=v';

        const result = redactForLog({body});

        expect(result.body).toBe(
            'grant_type=authorization_code&client_id=id&client_secret=%5BREDACTED%5D&code=%5BREDACTED%5D&code_verifier=%5BREDACTED%5D',
        );
    });

    it('decodes and re-encodes a base64 body', () => {
        const result = redactForLog({body: toBase64('grant_type=refresh_token&refresh_token=r'), isBase64Encoded: true});

        expect(result.isBase64Encoded).toBe(true);
        expect(fromBase64(result.body)).toBe('grant_type=refresh_token&refresh_token=%5BREDACTED%5D');
    });

    it('replaces compressed and binary bodies', () => {
        const gzipped = gzipSync('{"access_token":"a"}').toString('base64');

        expect(redactForLog({headers: {'Content-Encoding': 'gzip'}, body: gzipped, isBase64Encoded: true}).body).toBe('[REDACTED binary body]');
        expect(redactForLog({body: gzipped, isBase64Encoded: true}).body).toBe('[REDACTED binary body]');
    });

    it('leaves plain-text bodies without sensitive fields untouched', () => {
        expect(redactForLog({body: 'Disconnected. Removed 1 records.'}).body).toBe('Disconnected. Removed 1 records.');
    });

    it('does not mutate its input', () => {
        const event = {headers: {authorization: 'Bearer abc'}, cookies: ['a=b']};

        redactForLog(event);

        expect(event).toEqual({headers: {authorization: 'Bearer abc'}, cookies: ['a=b']});
    });

    it('passes non-object values through', () => {
        expect(redactForLog(null)).toBeNull();
        expect(redactForLog('text')).toBe('text');
    });
});
