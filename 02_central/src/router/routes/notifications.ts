import {deleteNotificationRule, getNotificationRules, upsertNotificationRule} from '@/controllers/notifications';
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

router.post('/api/integrations/:integrationId/notifications', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
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

    const userIntegrationIds = reqCtx.appContext?.integrations ?? [];
    return await upsertNotificationRule({rule, integrationId: reqCtx.params.integrationId, userIntegrationIds, createOnly: true});
});

router.put('/api/integrations/:integrationId/notifications/:id', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const event = reqCtx.event as APIGatewayProxyEventV2;
    const rule = JSON.parse(event.body ?? '{}');

    if (!isNotificationRuleUpdate(rule)) {
        return new Response(JSON.stringify({error: 'Invalid notification rule update'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    const userIntegrationIds = reqCtx.appContext?.integrations ?? [];
    return await upsertNotificationRule({rule, integrationId: reqCtx.params.integrationId, userIntegrationIds, ruleId: reqCtx.params.id});
});

router.delete('/api/integrations/:integrationId/notifications/:id', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const userIntegrationIds = reqCtx.appContext?.integrations ?? [];
    await deleteNotificationRule(reqCtx.params.id, reqCtx.params.integrationId, userIntegrationIds);

    return new Response(JSON.stringify({success: true}), {
        status: HttpStatusCodes.OK,
        headers: {
            'Content-Type': 'application/json',
        },
    });
});

export default router;
