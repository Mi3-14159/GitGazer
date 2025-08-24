import {APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult} from 'aws-lambda';
import {getLogger} from './logger';
import app from './router';

const logger = getLogger();

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    logger.info('handle event', JSON.stringify(event));

    const result = await app.handle(event);

    logger.info('handle result', JSON.stringify(result));

    return result;
};
