import {getLogger} from '../logger';
import {getParameter} from '../ssm';
import {tokenRepository} from '../repository';
import { Token, TokenType } from '../models/dynamodb';

const log = getLogger();

export class GithubAuthController {
    async handleLoginPathCreation(redirectUriBasePath: string): Promise<string> {
        log.debug({msg: 'handle login page creation', data: {redirectUriBasePath}});

        const valueString = await getParameter(process.env.GH_CLIENT_CONFIG_NAME);
        const ghClientConfig = JSON.parse(valueString);

        return `<a href="https://github.com/login/oauth/authorize?client_id=${ghClientConfig.id}&redirect_uri=${redirectUriBasePath}/auth/github/callback">Login with GitHub</a>`;
    }
      
    async exchangeCode(code: string): Promise<any> {
        const valueString = await getParameter(process.env.GH_CLIENT_CONFIG_NAME);
        const ghClientConfig = JSON.parse(valueString);

        const params = new URLSearchParams({
          client_id: ghClientConfig.id,
          client_secret: ghClientConfig.secret,
          code: code,
        });
      
        const response = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          body: params,
          headers: { Accept: 'application/json' },
        });
      
        if (response.ok) {
          return await response.json();
        }

        throw new Error(`Failed to exchange code ${code} for token.`);
    }

    async userInfo(token: string): Promise<any> {
        const response = await fetch('https://api.github.com/user', {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
      
        if (response.ok) {
            return await response.json();
        }

        throw new Error(`Failed to get user info with token ${token}.`);
      }

    async handleCallback(code: string): Promise<unknown> {
        log.info('handle github callback');

        const tokenData = await this.exchangeCode(code);
        const {
            access_token,
            expires_in,
            refresh_token,
            refresh_token_expires_in,
        } = tokenData;

        if (access_token) {
            const userInfoData = await this.userInfo(access_token);
            const {id, name, login} = userInfoData;

            const accessToken: Token = {
                userId: id,
                userHandle: login,
                type: TokenType.ACCESS,
                token: access_token,
                createdAt: Math.floor(new Date().getTime() / 1000),
                expireAt: Math.floor(new Date().getTime() / 1000) + expires_in,
            };

            const refreshToken: Token = {
                userId: id,
                userHandle: login,
                type: TokenType.REFRESH,
                token: refresh_token,
                createdAt: Math.floor(new Date().getTime() / 1000),
                expireAt: Math.floor(new Date().getTime() / 1000) + refresh_token_expires_in,
            };

            await tokenRepository.put(accessToken);
            await tokenRepository.put(refreshToken);

            return {
                body: `Successfully authorized! Welcome, ${name} (${login}).`,
            };
        }

        throw new Error(`Authorized, but unable to exchange code for token.`);
    }

    async refreshToken(userId: number): Promise<any> {
        log.info('refresh github token');

        const refreshToken = await tokenRepository.get(userId, TokenType.REFRESH);
        if (!refreshToken) {
            throw new Error(`No refresh token found for user ${userId}.`);
        }
        
        const valueString = await getParameter(process.env.GH_CLIENT_CONFIG_NAME);
        const ghClientConfig = JSON.parse(valueString);

        const params = new URLSearchParams({
          client_id: ghClientConfig.id,
          client_secret: ghClientConfig.secret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken.token,
        });
      
        const response = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          body: params,
          headers: { Accept: 'application/json' },
        });
      
        if (response.ok) {
          return await response.json();
        }
    }

    async handleRefresh(userId: number): Promise<unknown> {
        log.info('handle github refresh');

        const tokenData = await this.refreshToken(userId);
        const {
            access_token,
            expires_in,
            refresh_token,
            refresh_token_expires_in,
        } = tokenData;

        if (access_token) {
            const userInfoData = await this.userInfo(access_token);
            const {id, name, login} = userInfoData;

            const accessToken: Token = {
                userId: id,
                userHandle: login,
                type: TokenType.ACCESS,
                token: access_token,
                createdAt: Math.floor(new Date().getTime() / 1000),
                expireAt: Math.floor(new Date().getTime() / 1000) + expires_in,
            };

            const refreshToken: Token = {
                userId: id,
                userHandle: login,
                type: TokenType.REFRESH,
                token: refresh_token,
                createdAt: Math.floor(new Date().getTime() / 1000),
                expireAt: Math.floor(new Date().getTime() / 1000) + refresh_token_expires_in,
            };

            await tokenRepository.put(accessToken);
            await tokenRepository.put(refreshToken);

            return {
                body: `Successfully refreshed! Welcome, ${name} (${login}).`,
            };
        }

        throw new Error(`Refreshed, but unable to exchange code for token for user ${userId}.`);
    }
}
