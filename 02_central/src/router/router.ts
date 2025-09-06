import {APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2} from 'aws-lambda/trigger/api-gateway-proxy';

export type RouteHandler = (event: APIGatewayProxyEventV2WithJWTAuthorizer) => Promise<APIGatewayProxyResultV2>;
export type MiddlewareHandler = (event: APIGatewayProxyEventV2WithJWTAuthorizer) => Promise<APIGatewayProxyResultV2 | void>;

export class Router {
    routeKeys = new Map<string, RouteHandler>();
    middlewares: Array<MiddlewareHandler> = [];

    get(route: string, handler: RouteHandler): Router {
        this.routeKeys.set(`GET ${route}`, handler);
        return this;
    }

    post(route: string, handler: RouteHandler): Router {
        this.routeKeys.set(`POST ${route}`, handler);
        return this;
    }

    put(route: string, handler: RouteHandler): Router {
        this.routeKeys.set(`PUT ${route}`, handler);
        return this;
    }

    // Add middleware method
    middleware(middleware: MiddlewareHandler): Router {
        this.middlewares.push(middleware);
        return this;
    }

    handle: RouteHandler = async (event) => {
        const {routeKey} = event;
        const handler = this.routeKeys.get(routeKey);

        if (!handler || typeof handler !== 'function') {
            return {
                statusCode: 404,
                body: 'Not Found',
            };
        }

        // Run middlewares
        for (const middleware of this.middlewares) {
            const middlewareResult = await middleware(event);
            if (middlewareResult) {
                // Middleware returned a response, so we stop processing and return it
                return middlewareResult;
            }
        }

        // If we reach here, all middlewares passed
        return await handler(event);
    };

    use(router: Router): Router {
        // Don't merge middlewares globally - instead wrap the handlers with their middlewares
        router.routeKeys.forEach((handler, routeKey) => {
            // Create a wrapped handler that runs the sub-router's middlewares before the actual handler
            const wrappedHandler: RouteHandler = async (event) => {
                // Run the sub-router's middlewares first
                for (const middleware of router.middlewares) {
                    const middlewareResult = await middleware(event);
                    if (middlewareResult) {
                        // Middleware returned a response, so we stop processing and return it
                        return middlewareResult;
                    }
                }
                // If all middlewares passed, run the actual handler
                return await handler(event);
            };
            this.routeKeys.set(routeKey, wrappedHandler);
        });
        return this;
    }

    getRoutes(): string[] {
        return Array.from(this.routeKeys.keys());
    }
}
