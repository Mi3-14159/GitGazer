import {getIntegrations} from '@/controllers/integrations';
import {getLogger} from '../../logger';
import {Router} from '../router';

const logger = getLogger();
const router = new Router();

router.get('/api/integrations', async (event) => {
    logger.info('Handling request for /api/integrations');

    const groups: string[] = (event.requestContext.authorizer.jwt.claims['cognito:groups'] as string[]) ?? [];
    const integrations = await getIntegrations({
        integrationIds: groups,
    });

    return {
        statusCode: 200,
        body: JSON.stringify(integrations),
        headers: {
            'Content-Type': 'application/json',
        },
    };
});

export default router;
