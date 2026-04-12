import {addUserIntegrationsToCtx} from '@/domains/integrations/integrations.middleware';
import {deleteNotificationRule, getNotificationRules, upsertNotificationRule} from '@/domains/notifications/notifications.controller';
import {requireRole} from '@/shared/middleware/require-role';
import {AppRequestContext} from '@/shared/types';
import {BadRequestError, HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import {isNotificationRuleUpdate} from '@gitgazer/db/types';

const router = new Router();

router.get('/api/notifications', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const integrationIds = reqCtx.appContext?.integrations ?? [];
    return await getNotificationRules({
        integrationIds: integrationIds,
    });
});

router.post(
    '/api/integrations/:integrationId/notifications',
    [addUserIntegrationsToCtx, requireRole('member')],
    async (reqCtx: AppRequestContext) => {
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

        return await upsertNotificationRule({rule: requestBody, integrationId: reqCtx.params.integrationId, createOnly: true});
    },
);

router.put(
    '/api/integrations/:integrationId/notifications/:id',
    [addUserIntegrationsToCtx, requireRole('member')],
    async (reqCtx: AppRequestContext) => {
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

        return await upsertNotificationRule({
            rule: requestBody,
            integrationId: reqCtx.params.integrationId,
            ruleId: reqCtx.params.id,
        });
    },
);

router.delete(
    '/api/integrations/:integrationId/notifications/:id',
    [addUserIntegrationsToCtx, requireRole('member')],
    async (reqCtx: AppRequestContext) => {
        await deleteNotificationRule(reqCtx.params.id, reqCtx.params.integrationId);

        return new Response(JSON.stringify({success: true}), {
            status: HttpStatusCodes.OK,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    },
);

export default router;
