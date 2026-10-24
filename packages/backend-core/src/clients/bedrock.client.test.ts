import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockSend = vi.fn();
const clientCtor = vi.fn();

vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
    BedrockRuntimeClient: class {
        constructor(options: any) {
            clientCtor(options);
        }
        send(...args: any[]) {
            return mockSend(...args);
        }
    },
    ConverseCommand: class {
        constructor(public input: any) {}
    },
}));

let bedrock: typeof import('./bedrock.client');

beforeEach(async () => {
    vi.resetModules();
    mockSend.mockReset();
    clientCtor.mockReset();
    bedrock = await import('./bedrock.client');
});

describe('converse', () => {
    it('sends modelId and maxTokens and returns text', async () => {
        mockSend.mockResolvedValue({output: {message: {content: [{text: 'summary'}]}}});

        const text = await bedrock.converse({system: 'sys', prompt: 'log', maxTokens: 300});

        expect(text).toBe('summary');
        expect(clientCtor).toHaveBeenCalledWith({region: 'eu-central-1', useDualstackEndpoint: false, maxAttempts: 2});
        const {input} = mockSend.mock.calls[0][0];
        expect(input.modelId).toBe('eu.anthropic.claude-haiku-4-5-20251001-v1:0');
        expect(input.inferenceConfig.maxTokens).toBe(300);
        expect(input.system).toEqual([{text: 'sys'}]);
        expect(input.messages).toEqual([{role: 'user', content: [{text: 'log'}]}]);
    });

    it('returns an empty string when there is no text block', async () => {
        mockSend.mockResolvedValue({output: {message: {content: []}}});

        await expect(bedrock.converse({system: 's', prompt: 'p', maxTokens: 10})).resolves.toBe('');
    });
});
