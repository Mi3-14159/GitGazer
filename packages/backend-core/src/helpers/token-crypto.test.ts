import {beforeEach, describe, expect, it, vi} from 'vitest';

import config from '../config';

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-kms', () => ({
    KMSClient: class {
        send(...args: any[]) {
            return mockSend(...args);
        }
    },
    EncryptCommand: class {
        constructor(public input: any) {}
    },
    DecryptCommand: class {
        constructor(public input: any) {}
    },
}));

let tokenCrypto: typeof import('./token-crypto');

beforeEach(async () => {
    mockSend.mockReset();
    config.set('tokenKmsKeyId', 'key-1');
    tokenCrypto = await import('./token-crypto');
});

describe('encryptToken', () => {
    it('encrypts with the configured key and purpose context', async () => {
        mockSend.mockResolvedValue({CiphertextBlob: Buffer.from('cipher')});

        const result = await tokenCrypto.encryptToken('xoxb-secret');

        const {input} = mockSend.mock.calls[0][0];
        expect(input.KeyId).toBe('key-1');
        expect(input.EncryptionContext).toEqual({purpose: 'slack-bot-token'});
        expect(Buffer.from(input.Plaintext).toString()).toBe('xoxb-secret');
        expect(result).toBe(Buffer.from('cipher').toString('base64'));
    });

    it('round-trips through decrypt', async () => {
        mockSend.mockImplementation(async ({input}) => (input.Plaintext ? {CiphertextBlob: input.Plaintext} : {Plaintext: input.CiphertextBlob}));

        const ciphertext = await tokenCrypto.encryptToken('xoxb-secret');

        expect(await tokenCrypto.decryptToken(ciphertext)).toBe('xoxb-secret');
        expect(mockSend.mock.calls[1][0].input.EncryptionContext).toEqual({purpose: 'slack-bot-token'});
    });

    it('throws when tokenKmsKeyId is not set', async () => {
        config.set('tokenKmsKeyId', '');

        await expect(tokenCrypto.encryptToken('xoxb-secret')).rejects.toThrow('tokenKmsKeyId is not set');
        await expect(tokenCrypto.decryptToken('Y2lwaGVy')).rejects.toThrow('tokenKmsKeyId is not set');
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('never includes the plaintext in errors', async () => {
        mockSend.mockRejectedValue(new Error('AccessDenied'));

        const error = await tokenCrypto.encryptToken('xoxb-secret').catch((e: Error) => e);

        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).not.toContain('xoxb-secret');
    });
});
