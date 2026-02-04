import {deleteIntegration, getIntegrations, upsertIntegration} from '@/controllers/integrations';
import {addUserIntegrationsToCtx} from '@/router/middlewares/integrations';
import {AppRequestContext} from '@/types';
import {HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import {APIGatewayProxyEventV2} from 'aws-lambda';

const router = new Router();

router.get('/api/integrations', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const integrationIds = reqCtx.appContext?.integrations ?? [];
    return await getIntegrations({
        integrationIds: integrationIds,
    });
});

router.post('/api/integrations', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const event = reqCtx.event as APIGatewayProxyEventV2;
    if (!event.body) {
        return new Response(JSON.stringify({error: 'Missing request body'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    let requestBody;
    try {
        requestBody = JSON.parse(event.body);
    } catch (error) {
        return new Response(JSON.stringify({error: 'Invalid request body'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    if (!requestBody.label || typeof requestBody.label !== 'string') {
        return new Response(JSON.stringify({error: 'Invalid label'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
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
    const event = reqCtx.event as APIGatewayProxyEventV2;

    if (!reqCtx.params.integrationId) {
        return new Response(JSON.stringify({error: 'Missing integration ID'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    if (!event.body) {
        return new Response(JSON.stringify({error: 'Missing request body'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    let requestBody;
    try {
        requestBody = JSON.parse(event.body);
    } catch (error) {
        return new Response(JSON.stringify({error: 'Invalid request body'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    if (!requestBody.label || typeof requestBody.label !== 'string') {
        return new Response(JSON.stringify({error: 'Invalid label'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    const userGroups = reqCtx.appContext?.integrations ?? [];

    return await upsertIntegration({
        id: reqCtx.params.integrationId,
        label: requestBody.label,
        userGroups,
    });
});

router.delete('/api/integrations/:integrationId', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    if (!reqCtx.params.integrationId) {
        return new Response(JSON.stringify({error: 'Missing integration ID'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    const integrationIds = reqCtx.appContext?.integrations ?? [];
    await deleteIntegration(reqCtx.params.integrationId, integrationIds);

    return new Response(null, {
        status: HttpStatusCodes.NO_CONTENT,
    });
});

export default router;
