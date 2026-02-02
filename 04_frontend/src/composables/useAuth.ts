import {State, UserAttributes} from '@common/types';

const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN;
const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID;
const API_ENDPOINT = import.meta.env.VITE_REST_API_ENDPOINT;

let cachedUserAttributes: UserAttributes | null = null;
let authCheckPromise: Promise<boolean> | null = null;
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

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

    // If we get a 401, try to refresh the session and retry once
    if (response.status === 401 && !isRefreshing) {
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
                    await getUserAttributes();
                    return cachedUserAttributes !== null && Object.keys(cachedUserAttributes).length > 0;
                } catch {
                    return false;
                } finally {
                    authCheckPromise = null;
                }
            })();
        }
        return authCheckPromise;
    };

    const getUserAttributes = async (): Promise<UserAttributes> => {
        if (cachedUserAttributes) {
            return cachedUserAttributes;
        }

        try {
            const response = await fetchWithAuth(`${API_ENDPOINT}/user`);

            if (response.ok) {
                cachedUserAttributes = await response.json();
                return cachedUserAttributes!;
            }
        } catch (error) {
            console.error('Failed to fetch user attributes:', error);
        }

        return {};
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
        const logoutUrl = `https://${COGNITO_DOMAIN}/logout`;
        const params = new URLSearchParams({
            client_id: COGNITO_CLIENT_ID,
            logout_uri: window.location.origin,
        });

        cachedUserAttributes = null;

        window.location.href = `${logoutUrl}?${params.toString()}`;
    };

    return {
        isAuthenticated,
        getUserAttributes,
        signIn,
        signOut,
        fetchWithAuth, // Export the fetch wrapper for use in other composables
    };
};
