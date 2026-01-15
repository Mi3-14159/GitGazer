/**
 * Cookie-based authentication service without AWS Amplify
 * Direct Cognito OAuth integration
 */

const API_BASE_URL = import.meta.env.VITE_REST_API_ENDPOINT;
const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN;
const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID;
const HOST_URL = import.meta.env.VITE_HOST_URL;

/**
 * Sign in with GitHub via Cognito OAuth
 */
export async function signIn(): Promise<void> {
    const authUrl = new URL(`https://${COGNITO_DOMAIN}/oauth2/authorize`);
    authUrl.searchParams.set('client_id', COGNITO_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', `${HOST_URL}/auth/callback`);
    authUrl.searchParams.set('identity_provider', 'Github');
    authUrl.searchParams.set('scope', 'email profile openid aws.cognito.signin.user.admin');

    window.location.href = authUrl.toString();
}

/**
 * Handle OAuth callback and exchange code for tokens
 */
export async function handleCallback(code: string): Promise<boolean> {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/callback`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
                code,
                redirect_uri: `${HOST_URL}/auth/callback`,
            }),
        });

        if (!response.ok) {
            console.error('OAuth callback failed:', response.statusText);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error handling OAuth callback:', error);
        return false;
    }
}

/**
 * Check if user has valid session cookies
 */
export async function checkAuth(): Promise<boolean> {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/session`, {
            method: 'GET',
            credentials: 'include',
        });

        if (response.ok) {
            const data = await response.json();
            return data.authenticated === true;
        }

        return false;
    } catch (error) {
        console.error('Auth check failed:', error);
        return false;
    }
}

/**
 * Sign out and clear cookies
 */
export async function signOut(): Promise<void> {
    try {
        // Clear session cookies on backend
        await fetch(`${API_BASE_URL}/auth/logout`, {
            method: 'POST',
            credentials: 'include',
        });

        // Redirect to Cognito logout
        const logoutUrl = new URL(`https://${COGNITO_DOMAIN}/logout`);
        logoutUrl.searchParams.set('client_id', COGNITO_CLIENT_ID);
        logoutUrl.searchParams.set('logout_uri', `${HOST_URL}/login`);

        window.location.href = logoutUrl.toString();
    } catch (error) {
        console.error('Error during sign out:', error);
        // Still redirect to login even if backend call fails
        window.location.href = '/login';
    }
}

/**
 * Get current user info from backend
 */
export async function getUserInfo(): Promise<{
    userId: string;
    email?: string;
    username?: string;
    name?: string;
    nickname?: string;
    picture?: string;
    groups?: string[];
} | null> {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/user`, {
            method: 'GET',
            credentials: 'include',
        });

        if (response.ok) {
            return await response.json();
        }

        return null;
    } catch (error) {
        console.error('Error fetching user info:', error);
        return null;
    }
}

/**
 * Get current user info (placeholder for now)
 * In pure cookie implementation, user info comes from backend
 */
export async function getUser(): Promise<{authenticated: boolean}> {
    return {authenticated: await checkAuth()};
}
