import {APIGatewayProxyEventV2, APIGatewayProxyResultV2} from 'aws-lambda';

import {getLogger} from './logger';
import {handleEvent} from './routes';

const log = getLogger();

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    log.info({msg: 'handle event', data: event});
    
    const result = await handleEvent(event);

    return result;
};
