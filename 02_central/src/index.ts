import {resetLogger, set} from '@/logger';
import app from '@/router';
import {APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2, Context} from 'aws-lambda';

export const handler = async (event: APIGatewayProxyEventV2WithJWTAuthorizer, context: Context): Promise<APIGatewayProxyResultV2> => {
    const logger = set('requestId', context.awsRequestId);

    logger.debug({message: 'handle event', event});

    let result = await app.handle(event);

    logger.debug({message: 'result', result});

    logger.flush();
    resetLogger();
    return result;
};
