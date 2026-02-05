import {deleteNotificationRule, getNotificationRules, upsertNotificationRule} from '@/controllers/notifications';
import {addUserIntegrationsToCtx} from '@/router/middlewares/integrations';
import {AppRequestContext} from '@/types';
import {BadRequestError, HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import {isNotificationRuleUpdate} from '@common/types';

const router = new Router();

router.get('/api/notifications', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const integrationIds = reqCtx.appContext?.integrations ?? [];
    return await getNotificationRules({
        integrationIds: integrationIds,
    });
});

router.post('/api/integrations/:integrationId/notifications', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    if (!reqCtx.event.body) {
        throw new BadRequestError('Missing request body');
    }

    let requestBody;
    try {
        requestBody = await reqCtx.req.json();
    } catch (error) {
        throw new BadRequestError('Invalid request body');
    }

    if (!isNotificationRuleUpdate(requestBody)) {
        throw new BadRequestError('Invalid notification rule');
    }

    const userIntegrationIds = reqCtx.appContext?.integrations ?? [];
    return await upsertNotificationRule({rule: requestBody, integrationId: reqCtx.params.integrationId, userIntegrationIds, createOnly: true});
});

router.put('/api/integrations/:integrationId/notifications/:id', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    if (!reqCtx.event.body) {
        throw new BadRequestError('Missing request body');
    }

    let requestBody;
    try {
        requestBody = await reqCtx.req.json();
    } catch (error) {
        throw new BadRequestError('Invalid request body');
    }

    if (!isNotificationRuleUpdate(requestBody)) {
        throw new BadRequestError('Invalid notification rule update');
    }

    const userIntegrationIds = reqCtx.appContext?.integrations ?? [];
    return await upsertNotificationRule({
        rule: requestBody,
        integrationId: reqCtx.params.integrationId,
        userIntegrationIds,
        ruleId: reqCtx.params.id,
    });
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
