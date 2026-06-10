import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockGetSecretString = vi.fn();

vi.mock('@/shared/clients/secrets-manager.client', () => ({
    getSecretString: (...args: any[]) => mockGetSecretString(...args),
}));

import {__clearPatCache, resolvePat} from './pat-resolver';

describe('resolvePat', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __clearPatCache();
        delete process.env.BACKFILL_SECRET_PREFIX;
    });

    it('resolves a token using the default prefix and trims whitespace', async () => {
        mockGetSecretString.mockResolvedValue('  ghp_token  ');

        const token = await resolvePat('int-1');

        expect(token).toBe('ghp_token');
        expect(mockGetSecretString).toHaveBeenCalledWith('gitgazer/backfill/int-1');
    });

    it('uses the configured BACKFILL_SECRET_PREFIX', async () => {
        process.env.BACKFILL_SECRET_PREFIX = 'gitgazer/backfill/prod';
        mockGetSecretString.mockResolvedValue('ghp_token');

        await resolvePat('int-2');

        expect(mockGetSecretString).toHaveBeenCalledWith('gitgazer/backfill/prod/int-2');
    });

    it('strips trailing slashes from the prefix', async () => {
        process.env.BACKFILL_SECRET_PREFIX = 'gitgazer/backfill/prod/';
        mockGetSecretString.mockResolvedValue('ghp_token');

        await resolvePat('int-3');

        expect(mockGetSecretString).toHaveBeenCalledWith('gitgazer/backfill/prod/int-3');
    });

    it('caches tokens per integration', async () => {
        mockGetSecretString.mockResolvedValue('ghp_token');

        await resolvePat('int-1');
        await resolvePat('int-1');

        expect(mockGetSecretString).toHaveBeenCalledTimes(1);
    });

    it('throws when the secret is empty', async () => {
        mockGetSecretString.mockResolvedValue('   ');

        await expect(resolvePat('int-1')).rejects.toThrow(/is empty/);
    });
});
