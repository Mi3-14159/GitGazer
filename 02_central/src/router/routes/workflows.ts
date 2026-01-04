import {getWorkflows} from '@/controllers/workflows';
import {extractCognitoGroups} from '@/router/middlewares/authorization';
import {HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import {isWorkflowsRequestParameters} from '@common/types';
import {APIGatewayProxyEventV2WithJWTAuthorizer} from 'aws-lambda';

const router = new Router();

router.get('/api/workflows', [extractCognitoGroups], async (reqCtx) => {
    const event = reqCtx.event as APIGatewayProxyEventV2WithJWTAuthorizer;
    const groups: string[] = (event.requestContext.authorizer.jwt.claims['cognito:groups'] as string[]) ?? [];
    const {queryStringParameters} = event;

    try {
        if (queryStringParameters?.exclusiveStartKeys) {
            queryStringParameters.exclusiveStartKeys = JSON.parse(queryStringParameters.exclusiveStartKeys || 'null');
        }
    } catch (error) {
        return new Response(JSON.stringify({message: 'Invalid exclusiveStartKeys parameter'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    if (!isWorkflowsRequestParameters(queryStringParameters)) {
        return new Response(JSON.stringify({message: 'Invalid query parameters'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    const {limit, projection, exclusiveStartKeys} = queryStringParameters ?? {};

    const workflows = await getWorkflows({
        integrationIds: groups,
        limit,
        projection,
        exclusiveStartKeys,
    });

    return new Response(JSON.stringify(workflows), {
        status: HttpStatusCodes.OK,
        headers: {
            'Content-Type': 'application/json',
        },
    });
});

export default router;
