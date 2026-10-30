import {addUserIntegrationsToCtx} from '@/domains/integrations/integrations.middleware';
import {deleteNotificationRule, getNotificationRules, upsertNotificationRule} from '@/domains/notifications/notifications.controller';
import type {AppEnv} from '@/shared/hono/env';
import {BadRequestError, HttpStatusCodes} from '@/shared/errors';
import {isNotificationRuleUpdate} from '@gitgazer/db/types';
import type {Context} from 'hono';
import {Hono} from 'hono';

const router = new Hono<AppEnv>();

async function parseRuleBody(c: Context<AppEnv>): Promise<unknown> {
    if (!(await c.req.text())) {
        throw new BadRequestError('Missing request body');
    }

    try {
        return await c.req.json();
    } catch {
        throw new BadRequestError('Invalid request body');
    }
}

router.get('/notifications', addUserIntegrationsToCtx, async (c) => {
    const integrationIds = c.var.appContext?.integrations ?? [];
    return c.json(await getNotificationRules({integrationIds}));
});

router.post('/integrations/:integrationId/notifications', addUserIntegrationsToCtx, async (c) => {
    const requestBody = await parseRuleBody(c);

    if (!isNotificationRuleUpdate(requestBody)) {
        throw new BadRequestError('Invalid notification rule');
    }

    return c.json(await upsertNotificationRule({rule: requestBody, integrationId: c.req.param('integrationId'), createOnly: true}));
});

router.put('/integrations/:integrationId/notifications/:id', addUserIntegrationsToCtx, async (c) => {
    const requestBody = await parseRuleBody(c);

    if (!isNotificationRuleUpdate(requestBody)) {
        throw new BadRequestError('Invalid notification rule update');
    }

    return c.json(
        await upsertNotificationRule({
            rule: requestBody,
            integrationId: c.req.param('integrationId'),
            ruleId: c.req.param('id'),
        }),
    );
});

router.delete('/integrations/:integrationId/notifications/:id', addUserIntegrationsToCtx, async (c) => {
    await deleteNotificationRule(c.req.param('id'), c.req.param('integrationId'));

    return new Response(JSON.stringify({success: true}), {
        status: HttpStatusCodes.OK,
        headers: {
            'Content-Type': 'application/json',
        },
    });
});

export default router;
