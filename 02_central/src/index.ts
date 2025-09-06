import {APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2} from 'aws-lambda';
import {getLogger} from './logger';
import app from './router';

const logger = getLogger();

export const handler = async (event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> => {
    logger.info('handle event', JSON.stringify(event));

    let result = await app.handle(event);

    logger.info('result', JSON.stringify(result));
    return result;
};
