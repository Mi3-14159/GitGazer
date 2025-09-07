import {DeleteParameterCommand, GetParametersCommand, PutParameterCommand, SSMClient} from '@aws-sdk/client-ssm';
import {Integration} from '@common/types';

import {getLogger} from '@/logger';

const logger = getLogger();
const ssmClient = new SSMClient({});
const webhookSecretNamePrefix = process.env.SSM_PARAMETER_GH_WEBHOOK_SECRET_NAME_PREFIX;
if (!webhookSecretNamePrefix) {
    throw new Error('SSM_PARAMETER_GH_WEBHOOK_SECRET_NAME_PREFIX is not defined');
}

const kmsKeyId = process.env.KMS_KEY_ID;
if (!kmsKeyId) {
    throw new Error('KMS_KEY_ID is not defined');
}

export const getParameters = async (params: {names: string[]}): Promise<Integration[]> => {
    const command = new GetParametersCommand({
        Names: params.names.map((name) => `${webhookSecretNamePrefix}${name}`),
        WithDecryption: true,
    });

    const responses = await ssmClient.send(command);
    if (!responses.Parameters) {
        return [];
    }

    return responses.Parameters.map((param) => {
        const {Name, Value} = param;
        if (!Value) {
            logger.error(`requested parameter has no value: ${Name}`);
            return undefined;
        }
        const value = JSON.parse(Value);
        return {
            ...value,
            id: Name?.split('/').pop(),
        };
    }).filter((param) => param !== undefined);
};

export const putParameter = async (value: Integration): Promise<void> => {
    const command = new PutParameterCommand({
        Name: `${webhookSecretNamePrefix}${value.id}`,
        Value: JSON.stringify(value),
        Overwrite: true,
        KeyId: kmsKeyId,
        Type: 'SecureString',
    });

    await ssmClient.send(command);
};

export const deleteParameter = async (id: string): Promise<void> => {
    const command = new DeleteParameterCommand({
        Name: `${webhookSecretNamePrefix}${id}`,
    });

    await ssmClient.send(command);
};
