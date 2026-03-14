import {loadConfig} from '@/config';
import {createApp} from '@/router';
import {Router} from '@aws-lambda-powertools/event-handler/http';
import {APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context} from 'aws-lambda';
import {getLogger} from '@/logger';

const logger = getLogger();

let app: Router | null = null;
let initPromise: Promise<void> | null = null;

const init = async (): Promise<void> => {
    await loadConfig();
    app = createApp();
};

export const handler = async (event: APIGatewayProxyEventV2, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
    if (!initPromise) {
        initPromise = init();
    }
    await initPromise;

    if (!app) {
        throw new Error('Application router failed to initialize');
    }

    logger.resetKeys();
    logger.addContext(context);
    logger.logEventIfEnabled(event);

    const result = await app.resolve(event, context);

    logger.debug('result', {result});
    return result;
};
