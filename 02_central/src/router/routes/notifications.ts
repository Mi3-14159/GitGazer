import {getNotificationRules} from '@/clients/dynamodb';
import {getLogger} from '../../logger';
import {Router} from '../router';

const logger = getLogger();
const router = new Router();

router.get('/api/notifications', async (event) => {
    logger.info('Handling request for /api/notifications');

    const {
        requestContext: {
            authorizer: {groups},
        },
    } = event;

    if (!groups || groups.length === 0) {
        return {
            statusCode: 403,
            body: JSON.stringify({message: 'Forbidden'}),
        };
    }

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

export default router;
