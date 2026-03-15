import config from '@/shared/config';
import {buildAuthCookies, buildClearCookies} from '@/shared/helpers/cookies';
import {getLogger} from '@/shared/logger';
import {InternalServerError} from '@aws-lambda-powertools/event-handler/http';
import {WSToken} from '@gitgazer/db/types';
import {createHmac, randomBytes} from 'crypto';

type TokenResponse = {
    access_token: string;
    id_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
};

/**
 * Exchange an authorization code for Cognito tokens and return Set-Cookie headers.
 */
export const exchangeCodeForTokens = async (code: string): Promise<{tokens: TokenResponse; cookies: string[]}> => {
    const logger = getLogger();
    const {domain, clientId, clientSecret, redirectUri} = config.get('cognito');
    const tokenEndpoint = `https://${domain}/oauth2/token`;

    const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        redirect_uri: redirectUri,
    });

    const tokenResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: params.toString(),
    });

    if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        logger.error('Failed to exchange code for tokens', {
            status: tokenResponse.status,
            error: errorText,
        });
        throw new InternalServerError('Failed to exchange code for tokens');
    }

    const tokens: TokenResponse = await tokenResponse.json();
    logger.debug('Successfully obtained tokens from Cognito');

    return {tokens, cookies: buildAuthCookies(tokens)};
};

/**
 * Refresh Cognito tokens using a refresh token.
 * Returns new cookies on success, or clear-cookies + error on failure.
 */
export const refreshTokens = async (refreshToken: string): Promise<{success: true; cookies: string[]} | {success: false; clearCookies: string[]}> => {
    const logger = getLogger();
    const {domain, clientId, clientSecret} = config.get('cognito');
    const tokenEndpoint = `https://${domain}/oauth2/token`;

    const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshToken,
    });

    const tokenResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: params.toString(),
    });

    if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        logger.error('Failed to refresh tokens', {
            status: tokenResponse.status,
            error: errorText,
        });
        return {success: false, clearCookies: buildClearCookies()};
    }

    const tokens: TokenResponse = await tokenResponse.json();
    logger.debug('Successfully refreshed tokens');

    return {success: true, cookies: buildAuthCookies(tokens)};
};

/**
 * Generate a signed WebSocket token for authenticated users.
 */
export const generateWsToken = (params: {userId: number; username: string; email: string; integrations: string[]}): string => {
    const tokenPayload: WSToken = {
        userId: params.userId,
        username: params.username,
        email: params.email,
        integrations: params.integrations,
        exp: Math.floor(Date.now() / 1000) + 60,
        nonce: randomBytes(16).toString('hex'),
    };

    const {clientSecret} = config.get('cognito');
    const payload = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');
    const signature = createHmac('sha256', clientSecret).update(payload).digest('base64url');
    return `${payload}.${signature}`;
};
