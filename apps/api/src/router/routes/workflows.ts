import {getWorkflows} from '@/controllers/workflows';
import {addUserIntegrationsToCtx} from '@/router/middlewares/integrations';
import {AppRequestContext} from '@/types';
import {BadRequestError, HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import {isWorkflowsRequestParameters, WORKFLOW_FILTER_COLUMNS, WorkflowFilters} from '@gitgazer/db/types';
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

    // Extract column filters from query params
    const filters: WorkflowFilters = {};
    for (const column of WORKFLOW_FILTER_COLUMNS) {
        const value = queryStringParameters?.[column];
        if (typeof value === 'string' && value.length > 0) {
            filters[column] = value.split(',');
            delete queryStringParameters![column];
        }
    }
    // Extract date range filters
    if (queryStringParameters?.window) {
        filters.window = queryStringParameters.window as WorkflowFilters['window'];
        delete queryStringParameters.window;
    } else {
        if (queryStringParameters?.created_from) {
            filters.created_from = queryStringParameters.created_from;
            delete queryStringParameters.created_from;
        }
        if (queryStringParameters?.created_to) {
            filters.created_to = queryStringParameters.created_to;
            delete queryStringParameters.created_to;
        }
    }

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
