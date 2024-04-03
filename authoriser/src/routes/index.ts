import {APIGatewayProxyResultV2, APIGatewayProxyEventV2} from 'aws-lambda';
import { response } from './utils.js';
import {GetAuthGithub} from './getAuthGithub';
import { GetAuthGithubCallback } from './getAuthGithubCallback';

export interface RoutableParameters {
    event: APIGatewayProxyEventV2
}

export interface Routable {
    getRouteKey(): string;
    handleEvent(params: RoutableParameters): Promise<APIGatewayProxyResultV2>;
}

const routeMap = new Map<string, Routable>();

[
    new GetAuthGithub(),
    new GetAuthGithubCallback(),
].forEach((route) => {
    routeMap.set(route.getRouteKey(), route);
});

export const handleEvent = (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    const {routeKey} = event.requestContext;
    const route = routeMap.get(routeKey);
    if (!route) {
        return Promise.resolve(response(404, 'Page not found'));
    }

    return route.handleEvent({event});
};