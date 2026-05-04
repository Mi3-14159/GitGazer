import {GetSecretValueCommand, SecretsManagerClient} from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({useDualstackEndpoint: true});

export const getSecretValue = async (secretId: string): Promise<Record<string, unknown>> => {
    const response = await client.send(new GetSecretValueCommand({SecretId: secretId}));

    const secretString = response.SecretString;
    if (!secretString) {
        throw new Error(`Secret ${secretId} has no string value`);
    }

    return JSON.parse(secretString) as Record<string, unknown>;
};
