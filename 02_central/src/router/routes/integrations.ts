import {deleteIntegration, getIntegrations, upsertIntegration} from '@/controllers/integrations';
import {addUserIntegrationsToCtx} from '@/router/middlewares/integrations';
import {AppRequestContext} from '@/types';
import {BadRequestError, HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';

const router = new Router();

router.get('/api/integrations', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const integrationIds = reqCtx.appContext?.integrations ?? [];
    return await getIntegrations({
        integrationIds: integrationIds,
    });
});

router.post('/api/integrations', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    if (!reqCtx.event.body) {
        throw new BadRequestError('Missing request body');
    }

    let requestBody;
    try {
        requestBody = await reqCtx.req.json();
    } catch (error) {
        throw new BadRequestError('Invalid request body');
    }

    if (!requestBody.label || typeof requestBody.label !== 'string') {
        throw new BadRequestError('Invalid label');
    }

    const userId = reqCtx.appContext!.userId;
    const username = reqCtx.appContext!.username;
    const userGroups = reqCtx.appContext?.integrations ?? [];

    return await upsertIntegration({
        id: requestBody.id,
        label: requestBody.label,
        owner: userId,
        userName: username,
        userGroups,
    });
});

router.put('/api/integrations/:integrationId', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    if (!reqCtx.event.body) {
        throw new BadRequestError('Missing request body');
    }

    let requestBody;
    try {
        requestBody = await reqCtx.req.json();
    } catch (error) {
        throw new BadRequestError('Invalid request body');
    }

    if (!requestBody.label || typeof requestBody.label !== 'string') {
        throw new BadRequestError('Invalid label');
    }

    const userGroups = reqCtx.appContext?.integrations ?? [];

    return await upsertIntegration({
        id: reqCtx.params.integrationId,
        label: requestBody.label,
        userGroups,
    });
});

router.delete('/api/integrations/:integrationId', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const integrationIds = reqCtx.appContext?.integrations ?? [];
    await deleteIntegration(reqCtx.params.integrationId, integrationIds);

    return new Response(null, {
        status: HttpStatusCodes.NO_CONTENT,
    });
});

export default router;
