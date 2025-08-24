import {getLogger} from '@/logger';
import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda/trigger/api-gateway-proxy';

const logger = getLogger();

export type Middleware = (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult | undefined>;

// Custom handler type without context and callback
export type RouteHandler = (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;

export class Router {
    routeKeys = new Map<string, RouteHandler>();
    middlewares: Middleware[] = [];

    get(route: string, handler: RouteHandler): Router {
        this.routeKeys.set(`GET ${route}`, handler);
        return this;
    }

    post(route: string, handler: RouteHandler): Router {
        this.routeKeys.set(`POST ${route}`, handler);
        return this;
    }

    // Add middleware method
    middleware(middleware: Middleware): Router {
        this.middlewares.push(middleware);
        return this;
    }

    handle: RouteHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
        const {httpMethod, resource} = event;
        const handler = this.routeKeys.get(`${httpMethod} ${resource}`);
        logger.info(`Handling request for resource: ${httpMethod} ${resource}`, this.getRoutes());

        if (!handler) {
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
        const result = await handler(event);
        return result;
    };

    use(router: Router): Router {
        // Don't merge middlewares globally - instead wrap the handlers with their middlewares
        router.routeKeys.forEach((handler, routeKey) => {
            // Create a wrapped handler that runs the subrouter's middlewares before the actual handler
            const wrappedHandler: RouteHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
                // Run the subrouter's middlewares first
                for (const middleware of router.middlewares) {
                    const middlewareResult = await middleware(event);
                    if (middlewareResult) {
                        // Middleware returned a response, so we stop processing and return it
                        return middlewareResult;
                    }
                }
                // If all middlewares passed, run the actual handler
                return handler(event);
            };
            this.routeKeys.set(routeKey, wrappedHandler);
        });
        return this;
    }

    getRoutes(): string[] {
        return Array.from(this.routeKeys.keys());
    }
}
