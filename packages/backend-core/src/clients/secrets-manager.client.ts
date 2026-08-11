import {GetSecretValueCommand, SecretsManagerClient} from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({useDualstackEndpoint: true});

/** Returns the raw string value of a secret (no JSON parsing). */
export const getSecretString = async (secretId: string): Promise<string> => {
    const response = await client.send(new GetSecretValueCommand({SecretId: secretId}));

    const secretString = response.SecretString;
    if (!secretString) {
        throw new Error(`Secret ${secretId} has no string value`);
    }

    return secretString;
};

export const getSecretValue = async (secretId: string): Promise<Record<string, unknown>> => {
    const secretString = await getSecretString(secretId);

    return JSON.parse(secretString) as Record<string, unknown>;
};
