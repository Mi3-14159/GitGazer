import '@gitgazer/backend-core/bootstrap';
import {createApp} from '@/app';
import {redactHandleRouteBody, redactHandleRouteResult} from '@/shared/redact-handle-event';
import {loadConfig} from '@gitgazer/backend-core/config';
import {getLogger} from '@gitgazer/backend-core/logger';
import {initDb} from '@gitgazer/db/client';
import {handle, type LambdaEvent} from '@hono/aws-lambda';
import {APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context} from 'aws-lambda';

const logger = getLogger();

let lambdaHandler: ReturnType<typeof handle> | null = null;
let initPromise: Promise<void> | null = null;

const init = async (): Promise<void> => {
    await initDb();
    await loadConfig();
    lambdaHandler = handle(createApp());
};

export const handler = async (event: APIGatewayProxyEventV2, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
    if (!initPromise) {
        initPromise = init();
    }
    await initPromise;

    if (!lambdaHandler) {
        throw new Error('Application router failed to initialize');
    }

    logger.resetKeys();
    logger.addContext(context);
    logger.logEventIfEnabled(redactHandleRouteBody(event));

    // Hono's event type requires requestContext.authorizer, which API Gateway omits on routes without an authorizer
    const result = (await lambdaHandler(event as unknown as LambdaEvent, context)) as APIGatewayProxyStructuredResultV2;

    logger.debug('result', {result: redactHandleRouteResult(event, result)});
    return result;
};
