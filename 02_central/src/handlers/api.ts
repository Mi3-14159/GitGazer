import {getLogger} from '@/logger';
import app from '@/router';
import {APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2, Context} from 'aws-lambda';

const logger = getLogger();

export const handler = async (event: APIGatewayProxyEventV2WithJWTAuthorizer, context: Context): Promise<APIGatewayProxyResultV2> => {
    logger.resetKeys();
    logger.addContext(context);
    logger.logEventIfEnabled(event);

    const result = await app.handle(event);

    logger.debug({message: 'result', result});
    logger.flushBuffer();
    return result;
};
