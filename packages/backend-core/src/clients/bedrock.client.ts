import config from '../config';
import {SFNClient, StartSyncExecutionCommand} from '@aws-sdk/client-sfn';

let client: SFNClient | undefined;

const getClient = (): SFNClient => {
    client ??= new SFNClient({region: 'eu-central-1', useDualstackEndpoint: true, maxAttempts: 2});
    return client;
};

export const converse = async (params: {system: string; prompt: string; maxTokens: number}): Promise<string> => {
    const {bedrockStateMachineArn, bedrockModelId} = config.get('alerts');
    if (!bedrockStateMachineArn) {
        throw new Error('Bedrock state machine ARN is not configured');
    }

    const response = await getClient().send(
        new StartSyncExecutionCommand({
            stateMachineArn: bedrockStateMachineArn,
            input: JSON.stringify({modelId: bedrockModelId, system: params.system, prompt: params.prompt, maxTokens: params.maxTokens}),
        }),
    );

    // `cause` is deliberately left out: it can echo prompt content.
    if (response.status !== 'SUCCEEDED') {
        throw new Error(`Bedrock workflow execution ${response.status}: ${response.error ?? 'unknown error'}`);
    }

    return JSON.parse(response.output ?? '{}').text ?? '';
};
