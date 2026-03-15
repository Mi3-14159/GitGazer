import {getWorkflows} from '@/domains/workflows/workflows.controller';
import {addUserIntegrationsToCtx} from '@/domains/integrations/integrations.middleware';
import {parseWorkflowColumnFilters} from '@/shared/helpers/filters';
import {AppRequestContext} from '@/shared/types';
import {BadRequestError, HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import {isWorkflowsRequestParameters} from '@gitgazer/db/types';
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

    const filters = parseWorkflowColumnFilters(queryStringParameters);

    if (!isWorkflowsRequestParameters(queryStringParameters)) {
        throw new BadRequestError('Invalid query parameters');
    }

    const {limit, cursor} = queryStringParameters ?? {};

    const workflows = await getWorkflows({
        integrationIds,
        limit,
        cursor,
        filters: Object.keys(filters).length > 0 ? filters : undefined,
    });

    return new Response(JSON.stringify(workflows), {
        status: HttpStatusCodes.OK,
        headers: {
            'Content-Type': 'application/json',
        },
    });
});

export default router;
