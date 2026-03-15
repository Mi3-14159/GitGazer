import {getCustomQuerySchema, runCustomQuery} from '@/domains/metrics/custom-metrics.controller';
import {getDoraMetrics, getSpaceMetrics} from '@/domains/metrics/metrics.controller';
import {addUserIntegrationsToCtx} from '@/domains/integrations/integrations.middleware';
import {AppRequestContext} from '@/shared/types';
import {BadRequestError, HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import {listRepositories} from '@gitgazer/db/queries/metrics';
import {isMetricsFilter} from '@gitgazer/db/types/metrics';
import {APIGatewayProxyEventV2} from 'aws-lambda';

const router = new Router();

function parseMetricsFilter(event: APIGatewayProxyEventV2) {
    const params = event.queryStringParameters ?? {};
    if (!isMetricsFilter(params as Record<string, unknown>)) {
        throw new BadRequestError('Invalid query parameters');
    }
    return {
        repositoryId: params.repositoryId ? Number(params.repositoryId) : undefined,
        from: params.from,
        to: params.to,
        branch: params.branch,
        granularity: params.granularity as 'day' | 'week' | 'month' | undefined,
    };
}

router.get('/api/metrics/dora', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const userIntegrationIds = reqCtx.appContext?.integrations ?? [];
    if (!userIntegrationIds.length) {
        return new Response(JSON.stringify({message: 'No integrations found for user'}), {
            status: HttpStatusCodes.OK,
            headers: {'Content-Type': 'application/json'},
        });
    }

    const event = reqCtx.event as APIGatewayProxyEventV2;
    const filter = parseMetricsFilter(event);
    const requestedId = event.queryStringParameters?.integrationId;
    const integrationIds = requestedId && userIntegrationIds.includes(requestedId) ? [requestedId] : userIntegrationIds;

    const metrics = await getDoraMetrics({integrationIds, filter});

    return new Response(JSON.stringify(metrics), {
        status: HttpStatusCodes.OK,
        headers: {'Content-Type': 'application/json'},
    });
});

router.get('/api/metrics/space', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const userIntegrationIds = reqCtx.appContext?.integrations ?? [];
    if (!userIntegrationIds.length) {
        return new Response(JSON.stringify({message: 'No integrations found for user'}), {
            status: HttpStatusCodes.OK,
            headers: {'Content-Type': 'application/json'},
        });
    }

    const event = reqCtx.event as APIGatewayProxyEventV2;
    const filter = parseMetricsFilter(event);
    const requestedId = event.queryStringParameters?.integrationId;
    const integrationIds = requestedId && userIntegrationIds.includes(requestedId) ? [requestedId] : userIntegrationIds;

    const metrics = await getSpaceMetrics({integrationIds, filter});

    return new Response(JSON.stringify(metrics), {
        status: HttpStatusCodes.OK,
        headers: {'Content-Type': 'application/json'},
    });
});

router.get('/api/metrics/repositories', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const userIntegrationIds = reqCtx.appContext?.integrations ?? [];
    if (!userIntegrationIds.length) {
        return new Response(JSON.stringify([]), {
            status: HttpStatusCodes.OK,
            headers: {'Content-Type': 'application/json'},
        });
    }

    const event = reqCtx.event as APIGatewayProxyEventV2;
    const requestedId = event.queryStringParameters?.integrationId;
    const integrationIds = requestedId && userIntegrationIds.includes(requestedId) ? [requestedId] : userIntegrationIds;

    const repos = await listRepositories({integrationIds});

    return new Response(JSON.stringify(repos), {
        status: HttpStatusCodes.OK,
        headers: {'Content-Type': 'application/json'},
    });
});

router.post('/api/metrics/custom/query', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const userIntegrationIds = reqCtx.appContext?.integrations ?? [];
    if (!userIntegrationIds.length) {
        return new Response(JSON.stringify({message: 'No integrations found for user'}), {
            status: HttpStatusCodes.OK,
            headers: {'Content-Type': 'application/json'},
        });
    }

    const event = reqCtx.event as APIGatewayProxyEventV2;
    const requestedId = event.queryStringParameters?.integrationId;
    const integrationIds = requestedId && userIntegrationIds.includes(requestedId) ? [requestedId] : userIntegrationIds;

    let body: {query?: string};
    try {
        body = JSON.parse(event.body ?? '{}');
    } catch {
        throw new BadRequestError('Invalid JSON body');
    }

    if (!body.query || typeof body.query !== 'string' || !body.query.trim()) {
        throw new BadRequestError('Missing or invalid "query" field');
    }

    try {
        const result = await runCustomQuery({integrationIds, query: body.query});
        return new Response(JSON.stringify(result), {
            status: HttpStatusCodes.OK,
            headers: {'Content-Type': 'application/json'},
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Query execution failed';
        return new Response(JSON.stringify({error: message}), {
            status: 422,
            headers: {'Content-Type': 'application/json'},
        });
    }
});

router.get('/api/metrics/custom/schema', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const userIntegrationIds = reqCtx.appContext?.integrations ?? [];
    if (!userIntegrationIds.length) {
        return new Response(JSON.stringify([]), {
            status: HttpStatusCodes.OK,
            headers: {'Content-Type': 'application/json'},
        });
    }

    const schema = await getCustomQuerySchema({integrationIds: userIntegrationIds});
    return new Response(JSON.stringify(schema), {
        status: HttpStatusCodes.OK,
        headers: {'Content-Type': 'application/json'},
    });
});

export default router;
