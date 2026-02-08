import {BedrockRuntimeClient, ConverseCommand, ConverseCommandInput, ConverseCommandOutput} from '@aws-sdk/client-bedrock-runtime';

const bedrockRuntimeClient = new BedrockRuntimeClient();

export const converse = async (params: ConverseCommandInput): Promise<ConverseCommandOutput> => {
    const command = new ConverseCommand(params);
    return await bedrockRuntimeClient.send(command);
};
