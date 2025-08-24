import {APIGatewayProxyResult} from 'aws-lambda';
import {getLogger} from './logger';
import app from './router';
import {APIGatewayProxyEventWithCustomAuth, CustomAPIGatewayProxyHandler} from './types';

const logger = getLogger();

export const handler: CustomAPIGatewayProxyHandler = async (event: APIGatewayProxyEventWithCustomAuth): Promise<APIGatewayProxyResult> => {
    logger.info('handle event', JSON.stringify(event));

    const result = await app.handle(event);

    logger.info('handle result', JSON.stringify(result));

    return result;
};
