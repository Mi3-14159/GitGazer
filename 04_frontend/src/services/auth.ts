/**
 * Cookie-based authentication service
 * Wraps AWS Amplify authentication and manages httpOnly cookies
 */

import {fetchAuthSession, signInWithRedirect, signOut as amplifySignOut, getCurrentUser} from 'aws-amplify/auth';
import type {AuthUser} from 'aws-amplify/auth';

const API_BASE_URL = import.meta.env.VITE_REST_API_ENDPOINT;

interface SessionTokens {
    accessToken: string;
    idToken: string;
    refreshToken?: string;
    expiresIn?: number;
}

/**
 * Exchange Amplify tokens for httpOnly cookies
 * This should be called after successful Amplify authentication
 */
export async function exchangeTokensForCookies(): Promise<void> {
    try {
        const session = await fetchAuthSession({forceRefresh: false});

        if (!session.tokens?.idToken || !session.tokens?.accessToken) {
            throw new Error('No tokens available in session');
        }

        const tokens: SessionTokens = {
            accessToken: session.tokens.accessToken.toString(),
            idToken: session.tokens.idToken.toString(),
            expiresIn: session.tokens.accessToken.payload.exp
                ? session.tokens.accessToken.payload.exp - Math.floor(Date.now() / 1000)
                : 3600,
        };

        // Include refresh token if available
        // Note: Cognito doesn't expose refresh token via Amplify API in browser
        // It's managed internally by Amplify

        const response = await fetch(`${API_BASE_URL}/auth/session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include', // Important: include cookies in request
            body: JSON.stringify(tokens),
        });

        if (!response.ok) {
            throw new Error(`Failed to set session cookies: ${response.statusText}`);
        }

        console.info('Session cookies set successfully');
    } catch (error) {
        console.error('Error exchanging tokens for cookies:', error);
        throw error;
    }
}

/**
 * Check if user has valid session cookies
 */
export async function checkCookieSession(): Promise<boolean> {
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
        console.error('Error checking cookie session:', error);
        return false;
    }
}

/**
 * Sign in with redirect (uses AWS Amplify)
 */
export async function signIn(): Promise<void> {
    return signInWithRedirect({provider: {custom: 'Github'}});
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

        // Sign out from Amplify/Cognito
        await amplifySignOut();
    } catch (error) {
        console.error('Error during sign out:', error);
        throw error;
    }
}

/**
 * Get current user from Amplify
 * This still uses Amplify to get user info, but API calls will use cookies
 */
export async function getUser(): Promise<AuthUser> {
    return getCurrentUser();
}

/**
 * Get authentication session
 * This returns the Amplify session, but API calls will use cookies
 */
export async function getSession(forceRefresh = false) {
    return fetchAuthSession({forceRefresh});
}
