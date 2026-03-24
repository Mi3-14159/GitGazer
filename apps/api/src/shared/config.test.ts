import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

// Mock the secrets manager client
vi.mock('@/shared/clients/secrets-manager.client', () => ({
    getSecretValue: vi.fn(),
}));

describe('config', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.restoreAllMocks();
        delete process.env.CONFIG_SECRET_ARN;
    });

    afterEach(() => {
        delete process.env.CONFIG_SECRET_ARN;
    });

    it('loads default values when no secrets manager ARN is set', async () => {
        const {default: config, loadConfig} = await import('./config');

        await loadConfig();

        expect(config.get('environment')).toBe(process.env.ENVIRONMENT ?? 'default');
    });

    it('loads values from secrets manager when CONFIG_SECRET_ARN is set', async () => {
        const {getSecretValue} = await import('@/shared/clients/secrets-manager.client');
        // Use a key not set in .env.test so SM value is not overridden by an env var
        (getSecretValue as ReturnType<typeof vi.fn>).mockResolvedValue({
            importUrlBase: 'https://sm.example.com/import',
        });

        process.env.CONFIG_SECRET_ARN = 'arn:aws:secretsmanager:eu-central-1:123456789:secret:test-secret';

        const {default: config, loadConfig} = await import('./config');

        await loadConfig();

        expect(getSecretValue).toHaveBeenCalledWith('arn:aws:secretsmanager:eu-central-1:123456789:secret:test-secret');
        expect(config.get('importUrlBase')).toBe('https://sm.example.com/import');
    });

    it('environment variable overrides secrets manager value', async () => {
        const {getSecretValue} = await import('@/shared/clients/secrets-manager.client');
        // SM provides a value for uiBucketName
        (getSecretValue as ReturnType<typeof vi.fn>).mockResolvedValue({
            uiBucketName: 'sm-bucket',
        });

        process.env.CONFIG_SECRET_ARN = 'arn:aws:secretsmanager:eu-central-1:123456789:secret:test-secret';
        // Temporarily override the env var
        const original = process.env.UI_BUCKET_NAME;
        process.env.UI_BUCKET_NAME = 'env-bucket';

        const {default: config, loadConfig} = await import('./config');

        await loadConfig();

        // env var (UI_BUCKET_NAME=env-bucket) should take precedence over SM value (sm-bucket)
        expect(config.get('uiBucketName')).toBe('env-bucket');

        process.env.UI_BUCKET_NAME = original;
    });

    it('skips secrets manager fetch when CONFIG_SECRET_ARN is not set', async () => {
        const {getSecretValue} = await import('@/shared/clients/secrets-manager.client');

        const {loadConfig} = await import('./config');
        await loadConfig();

        expect(getSecretValue).not.toHaveBeenCalled();
    });

    it('exposes nested cognito config', async () => {
        const {default: config, loadConfig} = await import('./config');
        await loadConfig();

        // Values come from .env.test via vitest.config.ts loadEnv
        expect(config.get('cognito.userPoolId')).toBe(process.env.COGNITO_USER_POOL_ID ?? '');
        expect(config.get('cognito.clientId')).toBe(process.env.COGNITO_CLIENT_ID ?? '');
    });
});
