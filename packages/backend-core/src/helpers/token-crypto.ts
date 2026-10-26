import {DecryptCommand, EncryptCommand, KMSClient} from '@aws-sdk/client-kms';

import config from '../config';

const client = new KMSClient({useDualstackEndpoint: true});

const EncryptionContext = {purpose: 'slack-bot-token'};

const getKeyId = (): string => {
    const keyId = config.get('tokenKmsKeyId');
    if (!keyId) {
        throw new Error('tokenKmsKeyId is not set');
    }
    return keyId;
};

/** Returns the KMS ciphertext of a bot token, base64-encoded. */
export const encryptToken = async (plaintext: string): Promise<string> => {
    const response = await client.send(new EncryptCommand({KeyId: getKeyId(), Plaintext: Buffer.from(plaintext), EncryptionContext}));
    return Buffer.from(response.CiphertextBlob!).toString('base64');
};

export const decryptToken = async (ciphertext: string): Promise<string> => {
    const response = await client.send(new DecryptCommand({KeyId: getKeyId(), CiphertextBlob: Buffer.from(ciphertext, 'base64'), EncryptionContext}));
    return Buffer.from(response.Plaintext!).toString();
};
