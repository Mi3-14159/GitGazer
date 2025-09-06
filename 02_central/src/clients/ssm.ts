import {GetParametersCommand, SSMClient} from '@aws-sdk/client-ssm';
import {Integration} from '@common/types';

import {getLogger} from '@/logger';

const logger = getLogger();
const ssmClient = new SSMClient({});
const webhookSecretNamePrefix = process.env.SSM_PARAMETER_GH_WEBHOOK_SECRET_NAME_PREFIX;

export const getParameters = async (params: {names: string[]}): Promise<Integration[]> => {
    if (!webhookSecretNamePrefix) {
        throw new Error('SSM_PARAMETER_GH_WEBHOOK_SECRET_NAME_PREFIX is not defined');
    }

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
