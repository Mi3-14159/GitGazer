import {getJobs} from '@/controllers/jobs';
import {Router} from '@/router/router';

const router = new Router();

router.get('/api/jobs', async (event) => {
    const groups: string[] = (event.requestContext.authorizer.jwt.claims['cognito:groups'] as string[]) ?? [];
    const jobs = await getJobs({
        integrationIds: groups,
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
