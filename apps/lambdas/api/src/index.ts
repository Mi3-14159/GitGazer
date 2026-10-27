import '@gitgazer/backend-core/bootstrap';
import {initApp} from '@/app';
import {startServer} from '@/server';
import {redactHandleRouteBody, redactHandleRouteResult} from '@/shared/redact-handle-event';
import {getLogger} from '@gitgazer/backend-core/logger';
import {handle, type LambdaEvent} from '@hono/aws-lambda';
import {APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context} from 'aws-lambda';

const logger = getLogger();

let lambdaHandler: ReturnType<typeof handle> | null = null;

export const handler = async (event: APIGatewayProxyEventV2, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
    lambdaHandler ??= handle(await initApp());

    logger.resetKeys();
    logger.addContext(context);
    logger.logEventIfEnabled(redactHandleRouteBody(event));

    // Hono's event type requires requestContext.authorizer, which API Gateway omits on routes without an authorizer
    const result = (await lambdaHandler(event as unknown as LambdaEvent, context)) as APIGatewayProxyStructuredResultV2;

    logger.debug('result', {result: redactHandleRouteResult(event, result)});
    return result;
};

if (process.env.AWS_LAMBDA_HTTP_ENDPOINT) {
    startServer().catch((error) => {
        logger.error('Server failed to start', {error});
        process.exit(1);
    });
}
