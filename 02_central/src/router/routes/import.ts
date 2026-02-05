import {createWorkflow} from '@/controllers/imports';
import {getLogger} from '@/logger';
import {verifyGithubSign} from '@/router/middlewares/verifyGithubSign';

import {BadRequestError, HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';

const router = new Router();

router.post('/api/import/:integrationId', [verifyGithubSign], async (reqCtx) => {
    const logger = getLogger();

    if (!reqCtx.event.body) {
        throw new BadRequestError('Missing request body');
    }

    let requestBody;
    try {
        requestBody = await reqCtx.req.json();
    } catch (error) {
        throw new BadRequestError('Invalid request body');
    }

    try {
        await createWorkflow(reqCtx.params.integrationId, requestBody);
    } catch (error) {
        logger.error('Error creating workflow', error as Error);

        return new Response(JSON.stringify({message: 'Internal Server Error'}), {
            status: HttpStatusCodes.INTERNAL_SERVER_ERROR,
        });
    }

    return {message: 'ok'};
});

export default router;
