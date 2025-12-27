import {getLogger} from '@/logger';
import app from '@/router';
import {APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2, Context} from 'aws-lambda';

const logger = getLogger();

export const handler = async (event: APIGatewayProxyEventV2WithJWTAuthorizer, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
    logger.resetKeys();
    logger.addContext(context);
    logger.logEventIfEnabled(event);

    const result = await app.resolve(event, context);

    logger.debug({message: 'result', result});
    return result;
};
