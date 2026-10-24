import config from '../config';
import {proxyFetch} from './proxy-fetch';
import {defaultProvider} from '@aws-sdk/credential-provider-node';
import {Sha256} from '@smithy/core/checksum';
import {SignatureV4} from '@smithy/signature-v4';

let signer: SignatureV4 | undefined;

const getRegion = (): string => {
    const region = process.env.AWS_REGION;
    if (!region) throw new Error('AWS_REGION is not set');
    return region;
};

const getSigner = (region: string): SignatureV4 => {
    signer ??= new SignatureV4({service: 'bedrock', region, credentials: defaultProvider(), sha256: Sha256});
    return signer;
};

/** Signed here and relayed by the http-proxy Lambda, because the worker's VPC has no IPv4 egress and Bedrock has no IPv6 endpoint. */
export const converse = async (params: {system: string; prompt: string; maxTokens: number}): Promise<string> => {
    const region = getRegion();
    const hostname = `bedrock-runtime.${region}.amazonaws.com`;
    const path = `/model/${encodeURIComponent(config.get('alerts').bedrockModelId)}/converse`;
    const body = JSON.stringify({
        system: [{text: params.system}],
        messages: [{role: 'user', content: [{text: params.prompt}]}],
        inferenceConfig: {maxTokens: params.maxTokens},
    });

    const signed = await getSigner(region).sign({
        method: 'POST',
        protocol: 'https:',
        hostname,
        path,
        headers: {host: hostname, 'content-type': 'application/json'},
        body,
    });

    const response = await proxyFetch(`https://${hostname}${path}`, {method: 'POST', headers: signed.headers, body});

    // The body is left out: Bedrock error messages can echo prompt content.
    if (!response.ok) {
        const errorType = response.headers.get('x-amzn-errortype')?.split(':')[0] ?? 'unknown error';
        throw new Error(`Bedrock Converse failed with status ${response.status}: ${errorType}`);
    }

    const result = (await response.json()) as {output?: {message?: {content?: {text?: string}[]}}};
    return result.output?.message?.content?.find((block) => typeof block.text === 'string')?.text ?? '';
};
