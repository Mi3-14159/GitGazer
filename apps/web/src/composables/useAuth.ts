import {parseApiResponse} from '@/utils/apiResponse';
import {isUserAttributes, State, UserAttributes} from '@common/types';

const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN;
const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID;
const API_ENDPOINT = import.meta.env.VITE_REST_API_ENDPOINT;

let cachedUserAttributes: UserAttributes | null = null;
let authCheckPromise: Promise<boolean> | null = null;
let userAttributesPromise: Promise<UserAttributes | null> | null = null;
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

/** Reset all cached auth state. Must be called on sign-out to prevent stale data. */
function clearAuthState() {
    cachedUserAttributes = null;
    authCheckPromise = null;
    userAttributesPromise = null;
    isRefreshing = false;
    refreshPromise = null;
}

const refreshSession = async (): Promise<boolean> => {
    // If already refreshing, wait for the existing refresh operation
    if (isRefreshing && refreshPromise) {
        return refreshPromise;
    }

    isRefreshing = true;
    refreshPromise = (async () => {
        try {
            const response = await fetch(`${API_ENDPOINT}/auth/refresh`, {
                method: 'POST',
                credentials: 'include',
            });

            cachedUserAttributes = null;
            if (response.ok) {
                return true;
            } else {
                return false;
            }
        } catch (error) {
            console.error('Failed to refresh session:', error);
            cachedUserAttributes = null;
            return false;
        } finally {
            isRefreshing = false;
            refreshPromise = null;
        }
    })();

    return refreshPromise;
};

const fetchWithAuth = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const fetchOptions: RequestInit = {
        ...options,
        credentials: 'include',
    };

    let response = await fetch(url, fetchOptions);

    // If we get a 401, refresh the session and retry once.
    // If a refresh is already in progress, wait for it instead of returning the 401.
    if (response.status === 401) {
        const refreshed = await refreshSession();

        if (refreshed) {
            // Retry the original request with refreshed tokens
            response = await fetch(url, fetchOptions);
        }
    }

    return response;
};

export const useAuth = () => {
    const isAuthenticated = async (): Promise<boolean> => {
        // Avoid redundant calls by caching the promise
        if (!authCheckPromise) {
            authCheckPromise = (async () => {
                try {
                    const attrs = await getUserAttributes();
                    return attrs !== null && Object.keys(attrs).length > 0;
                } catch {
                    return false;
                } finally {
                    authCheckPromise = null;
                }
            })();
        }
        return authCheckPromise;
    };

    const getUserAttributes = async (): Promise<UserAttributes | null> => {
        if (cachedUserAttributes) {
            return cachedUserAttributes;
        }

        // Avoid redundant calls by caching the promise
        if (userAttributesPromise) {
            return userAttributesPromise;
        }

        userAttributesPromise = (async () => {
            try {
                const response = await fetchWithAuth(`${API_ENDPOINT}/user`);

                if (response.ok) {
                    cachedUserAttributes = await parseApiResponse(response, isUserAttributes);
                    return cachedUserAttributes;
                }

                // Non-ok after auth retry → user is not authenticated
                return null;
            } catch (error) {
                // Network errors are transient — propagate so callers can distinguish
                // from "not authenticated"
                throw error;
            } finally {
                userAttributesPromise = null;
            }
        })();

        return userAttributesPromise;
    };

    const signIn = () => {
        const authUrl = `https://${COGNITO_DOMAIN}/oauth2/authorize`;

        // Encode the current origin in state parameter for dynamic redirect
        const redirectUrl = window.location.origin;

        const state: State = {redirect_url: redirectUrl};
        const stateEncoded = btoa(JSON.stringify(state));

        const params = new URLSearchParams({
            client_id: COGNITO_CLIENT_ID,
            response_type: 'code',
            scope: 'email openid profile aws.cognito.signin.user.admin',
            redirect_uri: `${API_ENDPOINT}/auth/callback`,
            state: stateEncoded,
        });

        window.location.href = `${authUrl}?${params.toString()}`;
    };

    const signOut = () => {
        clearAuthState();
        window.location.href = `${API_ENDPOINT}/auth/logout?redirect_uri=${encodeURIComponent(window.location.origin)}`;
    };

    return {
        isAuthenticated,
        getUserAttributes,
        signIn,
        signOut,
        fetchWithAuth,
    };
};
