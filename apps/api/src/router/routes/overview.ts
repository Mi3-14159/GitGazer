import {getOverview} from '@/controllers/overview';
import {addUserIntegrationsToCtx} from '@/router/middlewares/integrations';
import {AppRequestContext} from '@/types';
import {HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import type {WorkflowFilters} from '@gitgazer/db/types';
import {ROLLING_WINDOWS} from '@gitgazer/db/types';
import {APIGatewayProxyEventV2} from 'aws-lambda';

const router = new Router();

router.get('/api/overview', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const integrationIds = reqCtx.appContext?.integrations ?? [];
    if (!integrationIds || integrationIds.length === 0) {
        return new Response(JSON.stringify({message: 'No integrations found for user'}), {
            status: HttpStatusCodes.OK,
            headers: {'Content-Type': 'application/json'},
        });
    }

    const event = reqCtx.event as APIGatewayProxyEventV2;
    const {queryStringParameters} = event;

    const filters: Pick<WorkflowFilters, 'window' | 'created_from' | 'created_to'> = {};
    if (queryStringParameters?.window) {
        const w = queryStringParameters.window;
        if (ROLLING_WINDOWS.includes(w as WorkflowFilters['window'] & string)) {
            filters.window = w as WorkflowFilters['window'];
        }
    } else {
        if (queryStringParameters?.created_from) {
            filters.created_from = queryStringParameters.created_from;
        }
        if (queryStringParameters?.created_to) {
            filters.created_to = queryStringParameters.created_to;
        }
    }

    const overview = await getOverview({
        integrationIds,
        filters: Object.keys(filters).length > 0 ? filters : undefined,
    });

    return new Response(JSON.stringify(overview), {
        status: HttpStatusCodes.OK,
        headers: {'Content-Type': 'application/json'},
    });
});

export default router;
