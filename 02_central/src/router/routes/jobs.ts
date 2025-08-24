import {getJobs} from '@/controllers/jobs';
import {getLogger} from '@/logger';
import {Router} from '@/router/router';

const logger = getLogger();
const router = new Router();

router.get('/api/jobs', async (event) => {
    logger.info('Handling request for /api/jobs');

    const {
        requestContext: {
            authorizer: {groups},
        },
    } = event;

    const jobs = await getJobs({
        integrationIds: groups ?? [],
    });

    return {
        statusCode: 200,
        body: JSON.stringify(jobs),
        headers: {
            'Content-Type': 'application/json',
        },
    };
});

export default router;
