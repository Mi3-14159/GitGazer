import {State, UserAttributes} from '@common/types';

const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN;
const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID;
const API_ENDPOINT = import.meta.env.VITE_REST_API_ENDPOINT;

let cachedUserAttributes: UserAttributes | null = null;
let authCheckPromise: Promise<boolean> | null = null;

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
            const response = await fetch(`${API_ENDPOINT}/user`, {
                credentials: 'include',
            });

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
    };
};
