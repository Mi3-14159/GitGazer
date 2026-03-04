import {isWorkflowsRequestParameters} from '@/common/types';
import {getWorkflows} from '@/controllers/workflows';
import {addUserIntegrationsToCtx} from '@/router/middlewares/integrations';
import {AppRequestContext} from '@/types';
import {BadRequestError, HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import {APIGatewayProxyEventV2} from 'aws-lambda';

const router = new Router();

router.get('/api/workflows', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const integrationIds = reqCtx.appContext?.integrations ?? [];
    if (!integrationIds || integrationIds.length === 0) {
        return new Response(JSON.stringify({message: 'No integrations found for user'}), {
            status: HttpStatusCodes.OK,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    const event = reqCtx.event as APIGatewayProxyEventV2;
    const {queryStringParameters} = event;

    try {
        if (queryStringParameters?.cursor) {
            queryStringParameters.cursor = JSON.parse(queryStringParameters.cursor || 'null');
        }
    } catch (error) {
        throw new BadRequestError('Invalid cursor parameter');
    }

    if (!isWorkflowsRequestParameters(queryStringParameters)) {
        throw new BadRequestError('Invalid query parameters');
    }

    const {limit, cursor} = queryStringParameters ?? {};

    const workflows = await getWorkflows({
        integrationIds,
        limit,
        cursor,
    });

    return new Response(JSON.stringify(workflows), {
        status: HttpStatusCodes.OK,
        headers: {
            'Content-Type': 'application/json',
        },
    });
});

export default router;
