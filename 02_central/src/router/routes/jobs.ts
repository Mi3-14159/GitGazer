import {getJobs} from '@/controllers/jobs';
import {Router} from '@/router/router';
import {isJobRequestParameters} from '@common/types';

const router = new Router();

router.get('/api/jobs', async (event) => {
    const groups: string[] = (event.requestContext.authorizer.jwt.claims['cognito:groups'] as string[]) ?? [];
    const {queryStringParameters} = event;

    if (!isJobRequestParameters(queryStringParameters)) {
        return {
            statusCode: 400,
            body: JSON.stringify({message: 'Invalid query parameters'}),
            headers: {
                'Content-Type': 'application/json',
            },
        };
    }

    const {limit, projection} = queryStringParameters ?? {};

    const jobs = await getJobs({
        integrationIds: groups,
        limit,
        projection,
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
