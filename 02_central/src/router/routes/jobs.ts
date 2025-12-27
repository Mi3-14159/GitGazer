import {getJobs} from '@/controllers/jobs';
import {extractCognitoGroups} from '@/router/middlewares/authorization';
import {HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import {isJobRequestParameters} from '@common/types';
import {APIGatewayProxyEventV2WithJWTAuthorizer} from 'aws-lambda';

const router = new Router();

router.get('/api/jobs', [extractCognitoGroups], async (reqCtx) => {
    const event = reqCtx.event as APIGatewayProxyEventV2WithJWTAuthorizer;
    const groups: string[] = (event.requestContext.authorizer.jwt.claims['cognito:groups'] as string[]) ?? [];
    const {queryStringParameters} = event;

    if (!isJobRequestParameters(queryStringParameters)) {
        return new Response(JSON.stringify({message: 'Invalid query parameters'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    const {limit, projection} = queryStringParameters ?? {};

    const jobs = await getJobs({
        integrationIds: groups,
        limit,
        projection,
    });

    return new Response(JSON.stringify(jobs), {
        status: HttpStatusCodes.OK,
        headers: {
            'Content-Type': 'application/json',
        },
    });
});

export default router;
