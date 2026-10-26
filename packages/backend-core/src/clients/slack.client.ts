import config from '../config';
import {proxyFetch} from './proxy-fetch';
import type {SlackChannel, SlackPayload} from '@gitgazer/db/types';

const SLACK_API = 'https://slack.com/api/';

export const SLACK_BOT_SCOPES = ['chat:write', 'chat:write.public', 'channels:read', 'groups:read', 'users:read', 'users:read.email'] as const;

const REVOKED_ERROR_CODES = ['invalid_auth', 'token_revoked', 'account_inactive', 'not_authed', 'token_expired'];

export class SlackApiError extends Error {
    constructor(readonly code: string) {
        super(`Slack API error: ${code}`);
        this.name = 'SlackApiError';
    }
}

// Slack errors carry only Slack's code; other errors (a failed query's params, say) may embed Slack IDs or secrets.
export const slackErrorReason = (error: unknown): string =>
    error instanceof SlackApiError ? error.code : error instanceof Error ? error.name : 'UnknownError';

export const isRevokedSlackError = (error: unknown): boolean => error instanceof SlackApiError && REVOKED_ERROR_CODES.includes(error.code);

type SlackCall = {token?: string; query?: Record<string, string>; form?: Record<string, string>; json?: object};

// Error messages carry only Slack's error code, never request data.
const slackCall = async <T>(method: string, {token, query, form, json}: SlackCall = {}): Promise<T> => {
    const url = SLACK_API + method + (query ? `?${new URLSearchParams(query)}` : '');
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    if (json) headers['Content-Type'] = 'application/json; charset=utf-8';

    const response = await proxyFetch(url, {
        method: form || json ? 'POST' : 'GET',
        headers,
        body: form ? new URLSearchParams(form).toString() : json ? JSON.stringify(json) : undefined,
    });

    if (response.status === 429) {
        throw new SlackApiError('ratelimited');
    }
    if (!response.ok) {
        throw new SlackApiError(`http_${response.status}`);
    }

    const body = (await response.json()) as {ok: boolean; error?: string} & T;
    if (!body.ok) {
        throw new SlackApiError(body.error ?? 'unknown_error');
    }
    return body;
};

const oauthForm = (code: string, redirectUri: string) => ({
    client_id: config.get('slackApp.clientId'),
    client_secret: config.get('slackApp.clientSecret'),
    code,
    redirect_uri: redirectUri,
});

export const buildInstallUrl = (state: string): string =>
    `https://slack.com/oauth/v2/authorize?${new URLSearchParams({
        client_id: config.get('slackApp.clientId'),
        scope: SLACK_BOT_SCOPES.join(','),
        redirect_uri: config.get('slackApp.installRedirectUri'),
        state,
    })}`;

export const buildSignInUrl = (state: string, nonce: string): string =>
    `https://slack.com/openid/connect/authorize?${new URLSearchParams({
        response_type: 'code',
        scope: 'openid',
        client_id: config.get('slackApp.clientId'),
        redirect_uri: config.get('slackApp.signInRedirectUri'),
        state,
        nonce,
    })}`;

export const exchangeInstallCode = async (code: string) => {
    const body = await slackCall<{
        access_token: string;
        bot_user_id: string;
        team: {id: string; name: string} | null;
        is_enterprise_install?: boolean;
    }>('oauth.v2.access', {form: oauthForm(code, config.get('slackApp.installRedirectUri'))});

    return {
        teamId: body.team?.id ?? '',
        teamName: body.team?.name ?? '',
        botUserId: body.bot_user_id,
        botToken: body.access_token,
        isEnterpriseInstall: body.is_enterprise_install ?? false,
    };
};

export const exchangeSignInCode = async (code: string) => {
    const {access_token} = await slackCall<{access_token: string}>('openid.connect.token', {
        form: oauthForm(code, config.get('slackApp.signInRedirectUri')),
    });
    const info = await slackCall<Record<string, string>>('openid.connect.userInfo', {token: access_token});

    return {slackUserId: info['https://slack.com/user_id'], teamId: info['https://slack.com/team_id']};
};

export const revokeToken = async (token: string): Promise<void> => {
    await slackCall('auth.revoke', {token});
};

export const listChannels = async (token: string): Promise<SlackChannel[]> => {
    const channels: SlackChannel[] = [];
    let cursor = '';
    do {
        const page = await slackCall<{
            channels: {id: string; name: string; is_private: boolean}[];
            response_metadata?: {next_cursor?: string};
        }>('conversations.list', {
            token,
            query: {types: 'public_channel,private_channel', exclude_archived: 'true', limit: '1000', ...(cursor && {cursor})},
        });
        channels.push(...page.channels.map((c) => ({id: c.id, name: c.name, isPrivate: c.is_private})));
        cursor = page.response_metadata?.next_cursor ?? '';
    } while (cursor);

    return channels.sort((a, b) => a.name.localeCompare(b.name));
};

export const getChannel = async (token: string, channelId: string): Promise<SlackChannel | null> => {
    try {
        const {channel} = await slackCall<{channel: {id: string; name: string; is_private: boolean; is_archived: boolean}}>('conversations.info', {
            token,
            query: {channel: channelId},
        });
        return channel.is_archived ? null : {id: channel.id, name: channel.name, isPrivate: channel.is_private};
    } catch (error) {
        if (error instanceof SlackApiError && error.code === 'channel_not_found') return null;
        throw error;
    }
};

export const postMessage = async (token: string, channelId: string, payload: SlackPayload): Promise<void> => {
    await slackCall('chat.postMessage', {token, json: {channel: channelId, ...payload}});
};

export const lookupUserByEmail = async (token: string, email: string): Promise<string | null> => {
    try {
        const {user} = await slackCall<{user: {id: string; deleted?: boolean; is_bot?: boolean}}>('users.lookupByEmail', {
            token,
            form: {email},
        });
        return user.deleted || user.is_bot ? null : user.id;
    } catch (error) {
        if (error instanceof SlackApiError && error.code === 'users_not_found') return null;
        throw error;
    }
};
