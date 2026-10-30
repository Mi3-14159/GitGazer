import config from '@gitgazer/backend-core/config';

/**
 * Validate a redirect URL against the configured allowlist of frontend origins.
 * Only the origin is kept; query strings and fragments are stripped to prevent
 * abuse via open-redirect chains on the same origin.
 * Returns the validated URL (origin + path only) or null if not allowed.
 */
export const validateRedirectUrl = (url: string): string | null => {
    try {
        const parsed = new URL(url);
        const allowedOrigins: string[] = config.get('allowedFrontendOrigins');
        const isAllowed = allowedOrigins.some((origin) => {
            const allowedOrigin = new URL(origin);
            return parsed.origin === allowedOrigin.origin;
        });
        if (!isAllowed) return null;
        // Strip query string and fragment — return only origin + pathname
        return url;
    } catch {
        return null;
    }
};

/** True when `origin` (e.g. an Origin header) is exactly one of the configured frontend origins. */
export const isAllowedFrontendOrigin = (origin: string | undefined): boolean => {
    if (!origin) return false;
    try {
        const parsed = new URL(origin).origin;
        return (config.get('allowedFrontendOrigins') as string[]).some((allowed) => new URL(allowed).origin === parsed);
    } catch {
        return false;
    }
};
