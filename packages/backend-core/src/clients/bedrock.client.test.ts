import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const proxyFetch = vi.fn();
const testCredentials: {accessKeyId: string; secretAccessKey: string; sessionToken?: string} = {
    accessKeyId: 'AKIDTESTKEY',
    secretAccessKey: 'test-secret',
};

vi.mock('./proxy-fetch', () => ({proxyFetch: (...args: unknown[]) => proxyFetch(...args)}));
vi.mock('@aws-sdk/credential-provider-node', () => ({
    defaultProvider: () => async () => ({...testCredentials}),
}));

const converseUrl = 'https://bedrock-runtime.eu-central-1.amazonaws.com/model/eu.anthropic.claude-haiku-4-5-20251001-v1%3A0/converse';

let bedrock: typeof import('./bedrock.client');

const jsonResponse = (body: unknown, init?: ResponseInit) =>
    new Response(JSON.stringify(body), {status: 200, headers: {'content-type': 'application/json'}, ...init});

beforeEach(async () => {
    vi.stubEnv('AWS_REGION', 'eu-central-1');
    proxyFetch.mockReset();
    delete testCredentials.sessionToken;
    vi.resetModules();
    bedrock = await import('./bedrock.client');
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe('converse', () => {
    it('sends a SigV4-signed Converse request through the proxy', async () => {
        proxyFetch.mockResolvedValue(jsonResponse({output: {message: {content: [{text: 'summary'}]}}}));

        await bedrock.converse({system: 'sys', prompt: 'log', maxTokens: 300});

        expect(proxyFetch).toHaveBeenCalledTimes(1);
        const [url, init] = proxyFetch.mock.calls[0];
        expect(url).toBe(converseUrl);
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body)).toEqual({
            system: [{text: 'sys'}],
            messages: [{role: 'user', content: [{text: 'log'}]}],
            inferenceConfig: {maxTokens: 300},
        });

        const {authorization} = init.headers;
        expect(authorization.startsWith('AWS4-HMAC-SHA256 Credential=AKIDTESTKEY/')).toBe(true);
        expect(authorization).toContain('/eu-central-1/bedrock/aws4_request');
        const signedHeaders = /SignedHeaders=([^,]+)/.exec(authorization)?.[1].split(';');
        expect(signedHeaders).toEqual(expect.arrayContaining(['host', 'x-amz-date']));
        expect(signedHeaders).not.toContain('content-length');
        expect(init.headers.host).toBe('bedrock-runtime.eu-central-1.amazonaws.com');
        expect(init.headers['content-type']).toBe('application/json');
        expect(init.headers['x-gitgazer-truncate-tail']).toBeUndefined();
    });

    it('includes the session token header when credentials have one', async () => {
        testCredentials.sessionToken = 'test-session-token';
        proxyFetch.mockResolvedValue(jsonResponse({output: {message: {content: [{text: 'summary'}]}}}));

        await bedrock.converse({system: 's', prompt: 'p', maxTokens: 10});

        const [, init] = proxyFetch.mock.calls[0];
        expect(init.headers['x-amz-security-token']).toBe('test-session-token');
    });

    it('returns the first text block', async () => {
        proxyFetch.mockResolvedValue(jsonResponse({output: {message: {content: [{reasoningContent: {}}, {text: 'first'}, {text: 'second'}]}}}));

        await expect(bedrock.converse({system: 's', prompt: 'p', maxTokens: 10})).resolves.toBe('first');
    });

    it("returns '' when there is no text", async () => {
        proxyFetch.mockResolvedValue(jsonResponse({output: {message: {content: []}}}));

        await expect(bedrock.converse({system: 's', prompt: 'p', maxTokens: 10})).resolves.toBe('');
    });

    it('throws with status and error type but not the body on failure', async () => {
        proxyFetch.mockResolvedValue(
            jsonResponse(
                {message: 'leaked prompt'},
                {
                    status: 429,
                    headers: {
                        'content-type': 'application/json',
                        'x-amzn-errortype': 'ThrottlingException:http://internal.amazon.com/coral/com.amazon.bedrock/',
                    },
                },
            ),
        );

        const error = await bedrock.converse({system: 's', prompt: 'secret prompt', maxTokens: 10}).catch((err: Error) => err);

        expect(error).toBeInstanceOf(Error);
        expect((error as Error).name).toBe('ThrottlingException');
        expect((error as Error).message).toContain('429');
        expect((error as Error).message).toContain('ThrottlingException');
        expect((error as Error).message).not.toContain('leaked prompt');
        expect((error as Error).message).not.toContain('secret prompt');
    });

    it('names the error UnknownBedrockError without an error type header', async () => {
        proxyFetch.mockResolvedValue(new Response('{}', {status: 500}));

        await expect(bedrock.converse({system: 's', prompt: 'p', maxTokens: 10})).rejects.toMatchObject({name: 'UnknownBedrockError'});
    });

    it('sends the signed request straight to Bedrock when no http proxy is configured', async () => {
        vi.stubEnv('HTTP_PROXY_FUNCTION_NAME', '');
        const actual = await vi.importActual<typeof import('./proxy-fetch')>('./proxy-fetch');
        proxyFetch.mockImplementation(actual.proxyFetch);
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({output: {message: {content: [{text: 'direct'}]}}}));
        vi.stubGlobal('fetch', fetchMock);

        await expect(bedrock.converse({system: 's', prompt: 'p', maxTokens: 10})).resolves.toBe('direct');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toBe(converseUrl);
        expect(init.method).toBe('POST');
        expect(new Headers(init.headers).get('authorization')).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDTESTKEY\//);
    });

    it('uses the region from AWS_REGION', async () => {
        vi.stubEnv('AWS_REGION', 'eu-west-1');
        proxyFetch.mockResolvedValue(jsonResponse({output: {message: {content: [{text: 'x'}]}}}));

        await bedrock.converse({system: 's', prompt: 'p', maxTokens: 10});

        const [url, init] = proxyFetch.mock.calls[0];
        expect(url).toBe('https://bedrock-runtime.eu-west-1.amazonaws.com/model/eu.anthropic.claude-haiku-4-5-20251001-v1%3A0/converse');
        expect(init.headers.authorization).toContain('/eu-west-1/bedrock/aws4_request');
    });

    it('throws when AWS_REGION is not set', async () => {
        vi.stubEnv('AWS_REGION', '');

        await expect(bedrock.converse({system: 's', prompt: 'p', maxTokens: 10})).rejects.toThrow('AWS_REGION is not set');
        expect(proxyFetch).not.toHaveBeenCalled();
    });

    it('uses the configured model ID', async () => {
        vi.stubEnv('ALERTS_BEDROCK_MODEL_ID', 'eu.anthropic.other-model-v1:0');
        vi.resetModules();
        bedrock = await import('./bedrock.client');
        proxyFetch.mockResolvedValue(jsonResponse({output: {message: {content: [{text: 'x'}]}}}));

        await bedrock.converse({system: 's', prompt: 'p', maxTokens: 10});

        expect(proxyFetch.mock.calls[0][0]).toBe('https://bedrock-runtime.eu-central-1.amazonaws.com/model/eu.anthropic.other-model-v1%3A0/converse');
    });
});
