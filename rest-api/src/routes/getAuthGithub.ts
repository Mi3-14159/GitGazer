import {APIGatewayProxyResultV2} from 'aws-lambda';

import {Routable, RoutableParameters} from '.';
import {response} from './utils';
import {loggable} from '../logger';
import { GithubAuthController } from '../controller';

@loggable()
export class GetAuthGithub implements Routable {
    githubAuthController = new GithubAuthController();

    getRouteKey(): string {
        return 'GET /auth/github';
    }

    async handleEvent(): Promise<APIGatewayProxyResultV2> {
        const data = await this.githubAuthController.handleLoginPathCreation();
        const contentType = 'text/html';
        return response(200, data, undefined, contentType);
    }
}