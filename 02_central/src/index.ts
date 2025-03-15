import {APIGatewayProxyEvent, APIGatewayProxyHandler} from 'aws-lambda';
import {authorize} from './auth';
import {createWorkflowJob} from './graphql';
import {getLogger} from './logger';

const log = getLogger();

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent) => {
    log.info('handle event', JSON.stringify(event));

    const authorizeResult = await authorize(event);
    if (authorizeResult) {
        return authorizeResult;
    }

    try {
        const githubEvent = JSON.parse(event.body);
        const integrationId = event.path.replace('/api/import/', '');
        await createWorkflowJob(integrationId, githubEvent);
    } catch (error) {
        log.error({
            err: error,
            event,
        });
        return {
            statusCode: 500,
            body: JSON.stringify({message: 'error'}),
        };
    }

    return {
        statusCode: 200,
        body: JSON.stringify({message: 'ok'}),
    };
};
