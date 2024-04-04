import {APIGatewayProxyResultV2} from 'aws-lambda';

import {Routable, RoutableParameters} from '.';
import {response} from './utils';
import {loggable} from '../logger';
import { GithubAuthController } from '../controller';

@loggable()
export class GetAuthGithubCallback implements Routable {
    githubAuthController = new GithubAuthController();

    getRouteKey(): string {
        return 'GET /auth/github/callback';
    }

    async handleEvent(params: RoutableParameters): Promise<APIGatewayProxyResultV2> {
        const {
            event: {
                queryStringParameters,
            }
        } = params;
        const data = await this.githubAuthController.handleCallback(queryStringParameters.code);
        return response(200, data);
    }
}