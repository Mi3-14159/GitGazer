import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mockSend = vi.fn();
const clientCtor = vi.fn();

vi.mock('@aws-sdk/client-sfn', () => ({
    SFNClient: class {
        constructor(options: any) {
            clientCtor(options);
        }
        send(...args: any[]) {
            return mockSend(...args);
        }
    },
    StartSyncExecutionCommand: class {
        constructor(public input: any) {}
    },
}));

const stateMachineArn = 'arn:aws:states:eu-central-1:000000000000:stateMachine:alert-summary';

let bedrock: typeof import('./bedrock.client');

const load = async () => {
    vi.resetModules();
    bedrock = await import('./bedrock.client');
};

beforeEach(async () => {
    mockSend.mockReset();
    clientCtor.mockReset();
    process.env.ALERTS_BEDROCK_STATE_MACHINE_ARN = stateMachineArn;
    await load();
});

afterEach(() => {
    delete process.env.ALERTS_BEDROCK_STATE_MACHINE_ARN;
});

describe('converse', () => {
    it('starts a sync execution with model, system, prompt and maxTokens', async () => {
        mockSend.mockResolvedValue({status: 'SUCCEEDED', output: JSON.stringify({text: 'summary'})});

        await bedrock.converse({system: 'sys', prompt: 'log', maxTokens: 300});

        const {input} = mockSend.mock.calls[0][0];
        expect(input.stateMachineArn).toBe(stateMachineArn);
        expect(JSON.parse(input.input)).toEqual({
            modelId: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0',
            system: 'sys',
            prompt: 'log',
            maxTokens: 300,
        });
    });

    it('uses the dual-stack endpoint', async () => {
        mockSend.mockResolvedValue({status: 'SUCCEEDED', output: JSON.stringify({text: 'summary'})});

        await bedrock.converse({system: 's', prompt: 'p', maxTokens: 10});

        expect(clientCtor).toHaveBeenCalledWith({region: 'eu-central-1', useDualstackEndpoint: true, maxAttempts: 2});
    });

    it('returns the text from the execution output', async () => {
        mockSend.mockResolvedValue({status: 'SUCCEEDED', output: JSON.stringify({text: 'summary'})});

        await expect(bedrock.converse({system: 's', prompt: 'p', maxTokens: 10})).resolves.toBe('summary');
    });

    it("returns '' when the output has no text", async () => {
        mockSend.mockResolvedValue({status: 'SUCCEEDED', output: JSON.stringify({})});

        await expect(bedrock.converse({system: 's', prompt: 'p', maxTokens: 10})).resolves.toBe('');
    });

    it('throws with status and error code when the execution fails', async () => {
        mockSend.mockResolvedValue({status: 'FAILED', error: 'States.Timeout', cause: 'leaked prompt'});

        const error = await bedrock.converse({system: 's', prompt: 'p', maxTokens: 10}).catch((err: Error) => err);

        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('FAILED');
        expect((error as Error).message).toContain('States.Timeout');
        expect((error as Error).message).not.toContain('leaked prompt');
    });

    it('throws when the state machine ARN is not configured', async () => {
        delete process.env.ALERTS_BEDROCK_STATE_MACHINE_ARN;
        await load();

        await expect(bedrock.converse({system: 's', prompt: 'p', maxTokens: 10})).rejects.toThrow('Bedrock state machine ARN is not configured');
        expect(mockSend).not.toHaveBeenCalled();
    });
});
