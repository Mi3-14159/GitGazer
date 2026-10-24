import config from '../config';
import {BedrockRuntimeClient, ConverseCommand} from '@aws-sdk/client-bedrock-runtime';

let client: BedrockRuntimeClient | undefined;

const getClient = (): BedrockRuntimeClient => {
    client ??= new BedrockRuntimeClient({region: 'eu-central-1', useDualstackEndpoint: true, maxAttempts: 2});
    return client;
};

export const converse = async (params: {system: string; prompt: string; maxTokens: number}): Promise<string> => {
    const response = await getClient().send(
        new ConverseCommand({
            modelId: config.get('alerts.bedrockModelId'),
            system: [{text: params.system}],
            messages: [{role: 'user', content: [{text: params.prompt}]}],
            inferenceConfig: {maxTokens: params.maxTokens},
        }),
    );

    return response.output?.message?.content?.find((block) => block.text !== undefined)?.text ?? '';
};
