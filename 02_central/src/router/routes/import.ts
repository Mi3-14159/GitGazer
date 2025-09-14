import {createWorkflowJob} from '@/controllers/imports';
import {getLogger} from '@/logger';
import {verifyGithubSign} from '@/router/middlewares/verifyGithubSign';
import {Router} from '@/router/router';

const router = new Router();

// Register the auth middleware for this router
router.middleware(verifyGithubSign);

router.post('/api/import/{integrationId}', async (event) => {
    const logger = getLogger(); // Get logger at runtime
    const {pathParameters, body} = event;

    if (!body || !pathParameters?.integrationId) {
        return {
            statusCode: 400,
            body: JSON.stringify({message: 'Bad Request'}),
        };
    }

    try {
        const githubEvent = JSON.parse(body);
        await createWorkflowJob(pathParameters.integrationId, githubEvent);
    } catch (error) {
        logger.error({
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
});

export default router;
