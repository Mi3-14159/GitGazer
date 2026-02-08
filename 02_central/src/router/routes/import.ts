import {createWorkflow} from '@/controllers/imports';
import {getLogger} from '@/logger';
import {verifyGithubSign} from '@/router/middlewares/verifyGithubSign';

import {BadRequestError, HttpError, InternalServerError, Router} from '@aws-lambda-powertools/event-handler/http';

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
        if (error instanceof HttpError) {
            throw error;
        }

        throw new InternalServerError('Error creating workflow');
    }

    return {message: 'ok'};
});

export default router;
