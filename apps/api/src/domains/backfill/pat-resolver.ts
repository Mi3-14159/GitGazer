import {getSecretString} from '@/shared/clients/secrets-manager.client';

/**
 * Resolves a per-integration GitHub personal access token (PAT) from AWS
 * Secrets Manager.
 *
 * Secrets follow the convention `<prefix>/<integrationId>`, where the prefix is
 * supplied via `BACKFILL_SECRET_PREFIX` (set on the Lambda by Terraform) and
 * defaults to `gitgazer/backfill`. IAM is scoped to `<prefix>/*` for least
 * privilege.
 *
 * Tokens are cached for the container lifetime to avoid a Secrets Manager call
 * per task.
 */

const DEFAULT_SECRET_PREFIX = 'gitgazer/backfill';

const cache = new Map<string, string>();

const getSecretPrefix = (): string => {
    const prefix = process.env.BACKFILL_SECRET_PREFIX?.trim();
    return prefix && prefix.length > 0 ? prefix.replace(/\/+$/, '') : DEFAULT_SECRET_PREFIX;
};

export const resolvePat = async (integrationId: string): Promise<string> => {
    const cached = cache.get(integrationId);
    if (cached) return cached;

    const secretId = `${getSecretPrefix()}/${integrationId}`;
    const token = (await getSecretString(secretId)).trim();
    if (token.length === 0) {
        throw new Error(`PAT secret "${secretId}" is empty`);
    }

    cache.set(integrationId, token);
    return token;
};

/** Test-only: clears the in-memory token cache. */
export const __clearPatCache = (): void => {
    cache.clear();
};
