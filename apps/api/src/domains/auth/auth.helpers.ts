import config from '@/shared/config';

/**
 * Validate a redirect URL against the configured allowlist of frontend origins.
 * Returns the validated URL or null if not allowed.
 */
export const validateRedirectUrl = (url: string): string | null => {
    try {
        const parsed = new URL(url);
        const allowedOrigins = config.get('allowedFrontendOrigins');
        const isAllowed = allowedOrigins.some((origin) => {
            const allowedOrigin = new URL(origin);
            return parsed.origin === allowedOrigin.origin;
        });
        return isAllowed ? url : null;
    } catch {
        return null;
    }
};
