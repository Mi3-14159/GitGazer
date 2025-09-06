import {deleteNotificationRule, getNotificationRules, postNotificationRule} from '@/controllers/notifications';
import {isNotificationRule} from '@/types';
import {getLogger} from '../../logger';
import {Router} from '../router';

const logger = getLogger();
const router = new Router();

router.get('/api/notifications', async (event) => {
    logger.info('Handling request for /api/notifications');

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
    logger.info(`Handling request for /api/notifications`);

    const groups: string[] = (event.requestContext.authorizer.jwt.claims['cognito:groups'] as string[]) ?? [];
    const rule = JSON.parse(event.body ?? '{}');
    if (!isNotificationRule(rule)) {
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
    logger.info('Handling request for', event.routeKey, event.rawPath);

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
