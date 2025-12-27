import {deleteNotificationRule, getNotificationRules, postNotificationRule} from '@/controllers/notifications';
import {extractCognitoGroups} from '@/router/middlewares/authorization';
import {HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import {isNotificationRuleUpdate} from '@common/types';
import {APIGatewayProxyEventV2WithJWTAuthorizer} from 'aws-lambda';

const router = new Router();

router.get('/api/notifications', [extractCognitoGroups], async (reqCtx) => {
    const event = reqCtx.event as APIGatewayProxyEventV2WithJWTAuthorizer;
    const groups: string[] = (event.requestContext.authorizer.jwt.claims['cognito:groups'] as string[]) ?? [];
    return await getNotificationRules({
        integrationIds: groups,
    });
});

router.post('/api/notifications', [extractCognitoGroups], async (reqCtx) => {
    const event = reqCtx.event as APIGatewayProxyEventV2WithJWTAuthorizer;
    const groups: string[] = (event.requestContext.authorizer.jwt.claims['cognito:groups'] as string[]) ?? [];
    const rule = JSON.parse(event.body ?? '{}');

    if (!isNotificationRuleUpdate(rule)) {
        return new Response(JSON.stringify({error: 'Invalid notification rule'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    return await postNotificationRule(rule, groups);
});

router.delete('/api/notifications/:id', [extractCognitoGroups], async (reqCtx) => {
    const event = reqCtx.event as APIGatewayProxyEventV2WithJWTAuthorizer;
    const groups: string[] = (event.requestContext.authorizer.jwt.claims['cognito:groups'] as string[]) ?? [];
    if (!reqCtx.params.id) {
        return new Response(JSON.stringify({error: 'Missing notification rule ID'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    const deleted = await deleteNotificationRule(reqCtx.params.id, groups);

    return new Response(JSON.stringify({success: deleted}), {
        status: deleted ? HttpStatusCodes.OK : HttpStatusCodes.NOT_FOUND,
        headers: {
            'Content-Type': 'application/json',
        },
    });
});

export default router;
