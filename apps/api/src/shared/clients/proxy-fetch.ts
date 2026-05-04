import {ProxyResponse} from '@/handlers/http-proxy';
import config from '@/shared/config';
import {FetchRetryOptions, fetchWithRetry} from '@/shared/helpers/fetch';
import {InvokeCommand, LambdaClient} from '@aws-sdk/client-lambda';

const client = new LambdaClient({useDualstackEndpoint: true}); // Enable IPv6 for Lambda invocation

/**
 * A fetch-compatible function that routes requests through the HTTP proxy Lambda.
 * Use for IPv4-only targets (GitHub, Slack) that aren't reachable from the VPC.
 */
export async function proxyFetch(url: string | URL, init?: FetchRetryOptions): Promise<Response> {
    const functionName = config.get('httpProxyFunctionName');
    if (!functionName) {
        return fetchWithRetry(url, init);
    }

    const method = (init?.method ?? 'GET').toUpperCase();
    const headers: Record<string, string> = {};
    if (init?.headers) {
        const h = init.headers;
        if (h instanceof Headers) {
            h.forEach((value, key) => {
                headers[key] = value;
            });
        } else if (Array.isArray(h)) {
            for (const [key, value] of h) {
                headers[key] = value;
            }
        } else {
            Object.assign(headers, h);
        }
    }

    let body: string | undefined;
    if (init?.body != null) {
        body = typeof init.body === 'string' ? init.body : String(init.body);
    }

    const command = new InvokeCommand({
        FunctionName: functionName,
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify({
            url: url.toString(),
            method,
            headers,
            body,
        }),
    });

    const result = await client.send(command);

    if (result.FunctionError) {
        const errorPayload = result.Payload ? new TextDecoder().decode(result.Payload) : 'Unknown error';
        throw new Error(`Proxy Lambda error: ${errorPayload}`);
    }

    if (!result.Payload) {
        throw new Error('Proxy Lambda returned empty response');
    }

    const proxyResponse: ProxyResponse = JSON.parse(new TextDecoder().decode(result.Payload));

    return new Response(proxyResponse.body, {
        status: proxyResponse.statusCode,
        headers: proxyResponse.headers,
    });
}
