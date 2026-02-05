import {executeQuery, getQueryExecution} from '@/controllers/analytics';
import {AppRequestContext} from '@/types';
import {BadRequestError, Router} from '@aws-lambda-powertools/event-handler/http';
import {isQueryRequestBody} from '@common/types/analytics';

const router = new Router();

router.post('/api/analytics/queries', async (reqCtx: AppRequestContext) => {
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

    return await executeQuery(reqCtx.appContext?.userId!, requestBody.query);
});

router.get('/api/analytics/queries/:queryId', async (reqCtx: AppRequestContext) => {
    return await getQueryExecution(reqCtx.appContext?.userId!, reqCtx.params.queryId);
});

export default router;
