import {deleteNotificationRule, getNotificationRules, postNotificationRule} from '@/controllers/notifications';
import {isNotificationRuleUpdate} from '@common/types';
import {Router} from '../router';

const router = new Router();

router.get('/api/notifications', async (event) => {
    const groups: string[] = (event.requestContext.authorizer.jwt.claims['cognito:groups'] as string[]) ?? [];
    const notificationRules = await getNotificationRules({
        integrationIds: groups,
    });

    return {
        statusCode: 200,
        body: JSON.stringify(notificationRules),
        headers: {
            'Content-Type': 'application/json',
        },
    };
});

router.post('/api/notifications', async (event) => {
    const groups: string[] = (event.requestContext.authorizer.jwt.claims['cognito:groups'] as string[]) ?? [];
    const rule = JSON.parse(event.body ?? '{}');

    if (!isNotificationRuleUpdate(rule)) {
        return {
            statusCode: 400,
            body: JSON.stringify({error: 'Invalid notification rule'}),
            headers: {
                'Content-Type': 'application/json',
            },
        };
    }

    const notificationRule = await postNotificationRule(rule, groups);

    return {
        statusCode: 200,
        body: JSON.stringify(notificationRule),
        headers: {
            'Content-Type': 'application/json',
        },
    };
});

router.delete('/api/notifications/{id}', async (event) => {
    const groups: string[] = (event.requestContext.authorizer.jwt.claims['cognito:groups'] as string[]) ?? [];
    if (!event.pathParameters?.id) {
        return {
            statusCode: 400,
            body: JSON.stringify({error: 'Missing notification rule ID'}),
            headers: {
                'Content-Type': 'application/json',
            },
        };
    }

    const deleted = await deleteNotificationRule(event.pathParameters.id, groups);

    return {
        statusCode: deleted ? 200 : 404,
        body: JSON.stringify({success: deleted}),
        headers: {
            'Content-Type': 'application/json',
        },
    };
});

export default router;
