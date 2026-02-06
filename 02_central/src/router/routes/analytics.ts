import {executeQuery, getQueryExecution, getSchema} from '@/controllers/analytics';
import {addUserIntegrationsToCtx} from '@/router/middlewares/integrations';
import {AppRequestContext} from '@/types';
import {BadRequestError, Router} from '@aws-lambda-powertools/event-handler/http';
import {isQueryRequestBody} from '@common/types/analytics';

const router = new Router();

router.post('/api/integrations/:integrationId/analytics/queries', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    if (!reqCtx.event.body) {
        throw new BadRequestError('Missing request body');
    }

    let requestBody;
    try {
        requestBody = await reqCtx.req.json();
    } catch (error) {
        throw new BadRequestError('Invalid request body');
    }

    if (!isQueryRequestBody(requestBody)) {
        throw new BadRequestError('Invalid request body');
    }

    return await executeQuery({
        userId: reqCtx.appContext?.userId!,
        query: requestBody.query,
        userIntegrations: reqCtx.appContext?.integrations!,
        integrationId: reqCtx.params.integrationId,
    });
});

router.get('/api/integrations/analytics/queries/:queryId', async (reqCtx: AppRequestContext) => {
    return await getQueryExecution(reqCtx.appContext?.userId!, reqCtx.params.queryId);
});

router.get('/api/integrations/analytics/schema', async () => {
    return await getSchema();
});

export default router;
