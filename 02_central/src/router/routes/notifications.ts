import {deleteNotificationRule, getNotificationRules, postNotificationRule} from '@/controllers/notifications';
import {addUserIntegrationsToCtx} from '@/router/middlewares/integrations';
import {AppRequestContext} from '@/types';
import {HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import {isNotificationRuleUpdate} from '@common/types';
import {APIGatewayProxyEventV2} from 'aws-lambda';

const router = new Router();

router.get('/api/notifications', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const integrationIds = reqCtx.appContext?.integrations ?? [];
    return await getNotificationRules({
        integrationIds: integrationIds,
    });
});

router.post('/api/notifications', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const event = reqCtx.event as APIGatewayProxyEventV2;
    const rule = JSON.parse(event.body ?? '{}');

    if (!isNotificationRuleUpdate(rule)) {
        return new Response(JSON.stringify({error: 'Invalid notification rule'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    const integrationIds = reqCtx.appContext?.integrations ?? [];
    return await postNotificationRule(rule, integrationIds);
});

router.delete('/api/notifications/:id', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    if (!reqCtx.params.id) {
        return new Response(JSON.stringify({error: 'Missing notification rule ID'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    const integrationIds = reqCtx.appContext?.integrations ?? [];
    const deleted = await deleteNotificationRule(reqCtx.params.id, integrationIds);

    return new Response(JSON.stringify({success: deleted}), {
        status: deleted ? HttpStatusCodes.OK : HttpStatusCodes.NOT_FOUND,
        headers: {
            'Content-Type': 'application/json',
        },
    });
});

export default router;
