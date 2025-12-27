import {createWorkflow} from '@/controllers/imports';
import {getLogger} from '@/logger';
import {verifyGithubSign} from '@/router/middlewares/verifyGithubSign';

import {HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';

const router = new Router();

router.post('/api/import/:integrationId', [verifyGithubSign], async (reqCtx) => {
    const logger = getLogger(); // Get logger at runtime
    const {body} = reqCtx.event;

    if (!body || !reqCtx.params.integrationId) {
        return new Response(JSON.stringify({message: 'Bad Request'}), {
            status: HttpStatusCodes.BAD_REQUEST,
        });
    }

    try {
        const githubEvent = JSON.parse(body);
        await createWorkflow(reqCtx.params.integrationId, githubEvent);
    } catch (error) {
        logger.error('Error creating workflow', error as Error);

        return new Response(JSON.stringify({message: 'Internal Server Error'}), {
            status: HttpStatusCodes.INTERNAL_SERVER_ERROR,
        });
    }

    return {message: 'ok'};
});

export default router;
