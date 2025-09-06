import {lowercaseHeaders} from '@/router/middlewares/lowercaseHeaders';
import {APIGatewayProxyEventV2WithJWTAuthorizer} from 'aws-lambda';
import {describe, expect, it} from 'vitest';

describe('lowercaseHeaders middleware', () => {
    it('should convert header keys to lowercase', async () => {
        const mockEvent = {
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer token123',
                'X-Custom-Header': 'custom-value',
            },
        } as Partial<APIGatewayProxyEventV2WithJWTAuthorizer> as APIGatewayProxyEventV2WithJWTAuthorizer;

        const result = await lowercaseHeaders(mockEvent);

        expect(result).toBeUndefined();
        expect(mockEvent.headers).toEqual({
            'content-type': 'application/json',
            authorization: 'Bearer token123',
            'x-custom-header': 'custom-value',
        });
    });

    it('should return undefined when headers property is undefined', async () => {
        const mockEvent = {} as APIGatewayProxyEventV2WithJWTAuthorizer;

        const result = await lowercaseHeaders(mockEvent);

        expect(result).toBeUndefined();
        expect(mockEvent.headers).toBeUndefined();
    });

    it('should handle empty headers object', async () => {
        const mockEvent = {
            headers: {},
        } as APIGatewayProxyEventV2WithJWTAuthorizer;

        const result = await lowercaseHeaders(mockEvent);

        expect(result).toBeUndefined();
        expect(mockEvent.headers).toEqual({});
    });

    it('should preserve header values exactly', async () => {
        const mockEvent = {
            headers: {
                ACCEPT: 'APPLICATION/JSON',
                'User-Agent': 'Mozilla/5.0 (Test Browser)',
                'x-forwarded-for': '192.168.1.1',
            },
        } as Partial<APIGatewayProxyEventV2WithJWTAuthorizer> as APIGatewayProxyEventV2WithJWTAuthorizer;

        const result = await lowercaseHeaders(mockEvent);

        expect(result).toBeUndefined();
        expect(mockEvent.headers).toEqual({
            accept: 'APPLICATION/JSON',
            'user-agent': 'Mozilla/5.0 (Test Browser)',
            'x-forwarded-for': '192.168.1.1',
        });
    });

    it('should handle headers that are already lowercase', async () => {
        const mockEvent = {
            headers: {
                'content-type': 'text/html',
                accept: 'text/html,application/xhtml+xml',
            },
        } as Partial<APIGatewayProxyEventV2WithJWTAuthorizer> as APIGatewayProxyEventV2WithJWTAuthorizer;

        const result = await lowercaseHeaders(mockEvent);

        expect(result).toBeUndefined();
        expect(mockEvent.headers).toEqual({
            'content-type': 'text/html',
            accept: 'text/html,application/xhtml+xml',
        });
    });

    it('should handle single header', async () => {
        const mockEvent = {
            headers: {
                'Content-Length': '1234',
            },
        } as Partial<APIGatewayProxyEventV2WithJWTAuthorizer> as APIGatewayProxyEventV2WithJWTAuthorizer;

        const result = await lowercaseHeaders(mockEvent);

        expect(result).toBeUndefined();
        expect(mockEvent.headers).toEqual({
            'content-length': '1234',
        });
    });

    it('should mutate the original event object', async () => {
        const originalHeaders = {
            'Content-Type': 'application/json',
            AUTHORIZATION: 'Bearer test',
        };
        const mockEvent = {
            headers: originalHeaders,
        } as Partial<APIGatewayProxyEventV2WithJWTAuthorizer> as APIGatewayProxyEventV2WithJWTAuthorizer;

        await lowercaseHeaders(mockEvent);

        // Verify the original event was mutated
        expect(mockEvent.headers).not.toBe(originalHeaders);
        expect(mockEvent.headers).toEqual({
            'content-type': 'application/json',
            authorization: 'Bearer test',
        });
    });
});
