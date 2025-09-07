import {createWorkflowJob} from '@/controllers/imports';
import {getLogger} from '../../logger';
import {verifyGithubSign} from '../middlewares/verifyGithubSign';
import {Router} from '../router';

const logger = getLogger();
const router = new Router();

// Register the auth middleware for this router
router.middleware(verifyGithubSign);

router.post('/api/import/{integrationId}', async (event) => {
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
