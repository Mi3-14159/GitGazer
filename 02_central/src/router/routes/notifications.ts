import {deleteNotificationRule, getNotificationRules, postNotificationRule} from '@/controllers/notifications';
import {extractUserIntegrations} from '@/router/middlewares/authorization';
import {AuthorizerContext} from '@/types';
import {HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import {isNotificationRuleUpdate} from '@common/types';
import {APIGatewayProxyEventV2WithLambdaAuthorizer} from 'aws-lambda';

const router = new Router();

router.get('/api/notifications', [extractUserIntegrations], async (reqCtx) => {
    const event = reqCtx.event as APIGatewayProxyEventV2WithLambdaAuthorizer<AuthorizerContext>;
    const integrationIds = event.requestContext.authorizer.lambda.integrations ?? [];
    return await getNotificationRules({
        integrationIds: integrationIds,
    });
});

router.post('/api/notifications', [extractUserIntegrations], async (reqCtx) => {
    const event = reqCtx.event as APIGatewayProxyEventV2WithLambdaAuthorizer<AuthorizerContext>;
    const integrationIds = event.requestContext.authorizer.lambda.integrations ?? [];
    const rule = JSON.parse(event.body ?? '{}');

    if (!isNotificationRuleUpdate(rule)) {
        return new Response(JSON.stringify({error: 'Invalid notification rule'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    return await postNotificationRule(rule, integrationIds);
});

router.delete('/api/notifications/:id', [extractUserIntegrations], async (reqCtx) => {
    const event = reqCtx.event as APIGatewayProxyEventV2WithLambdaAuthorizer<AuthorizerContext>;
    const integrationIds = event.requestContext.authorizer.lambda.integrations ?? [];
    if (!reqCtx.params.id) {
        return new Response(JSON.stringify({error: 'Missing notification rule ID'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    const deleted = await deleteNotificationRule(reqCtx.params.id, integrationIds);

    return new Response(JSON.stringify({success: deleted}), {
        status: deleted ? HttpStatusCodes.OK : HttpStatusCodes.NOT_FOUND,
        headers: {
            'Content-Type': 'application/json',
        },
    });
});

export default router;
