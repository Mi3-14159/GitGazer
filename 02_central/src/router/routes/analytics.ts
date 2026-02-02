import {getJobMetrics} from '@/controllers/analytics';
import {getLogger} from '@/logger';
import {addUserIntegrationsToCtx} from '@/router/middlewares/integrations';
import {AppRequestContext} from '@/types';
import {HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import {isJobMetricsParameters} from '@common/types/metrics';
import {APIGatewayProxyEventV2} from 'aws-lambda';

const router = new Router();
const logger = getLogger();

router.post('/api/analytics/jobs/metrics', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const event = reqCtx.event as APIGatewayProxyEventV2;
    const integrationIds = reqCtx.appContext?.integrations ?? [];
    if (!integrationIds || integrationIds.length === 0) {
        return new Response(JSON.stringify({message: 'No integrations found for user'}), {
            status: HttpStatusCodes.OK,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    if (!event.body) {
        return new Response(JSON.stringify({message: 'Request body is required'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    let parsedBody: unknown;
    try {
        parsedBody = JSON.parse(event.body);
    } catch (error) {
        return new Response(JSON.stringify({message: 'Invalid JSON body'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    if (!isJobMetricsParameters(parsedBody)) {
        return new Response(JSON.stringify({message: 'Invalid metrics request parameters'}), {
            status: HttpStatusCodes.BAD_REQUEST,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    // compact the filters
    const compactedFilters = parsedBody.filters
        .reduce(
            (acc, filter) => {
                const existingFilter = acc.find((f) => f.name === filter.name);
                if (existingFilter) {
                    existingFilter.values.push(...filter.values);
                } else {
                    acc.push({name: filter.name, values: [...filter.values]});
                }
                return acc;
            },
            [] as typeof parsedBody.filters,
        )
        .map((filter) => ({
            name: filter.name,
            values: Array.from(new Set(filter.values)),
        }));

    parsedBody.filters = compactedFilters;

    parsedBody.dimensions = Array.from(new Set(parsedBody.dimensions));

    try {
        return await getJobMetrics(integrationIds, parsedBody);
    } catch (error) {
        logger.error('Error fetching job metrics', {error});
        return new Response(JSON.stringify({message: error instanceof Error ? error.message : 'Internal Server Error'}), {
            status: HttpStatusCodes.INTERNAL_SERVER_ERROR,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
});

export default router;
