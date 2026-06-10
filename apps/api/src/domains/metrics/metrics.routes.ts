import {addUserIntegrationsToCtx} from '@/domains/integrations/integrations.middleware';
import type {MetricName} from '@/domains/metrics/metrics.controller';
import {getWidgetMetric, VALID_METRIC_NAMES} from '@/domains/metrics/metrics.controller';
import {AppRequestContext} from '@/shared/types';
import {BadRequestError, HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import {listRepositories, listTopics} from '@gitgazer/db/queries/metrics';
import type {GroupByOption} from '@gitgazer/db/types/metrics';
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
        repositoryIds: params.repositoryIds
            ? params.repositoryIds
                  .split(',')
                  .map(Number)
                  .filter((n) => !isNaN(n))
            : undefined,
        topics: params.topics ? params.topics.split(',').filter(Boolean) : undefined,
        from: params.from,
        to: params.to,
        defaultBranchOnly: params.defaultBranchOnly === 'true',
        usersOnly: params.usersOnly === 'true',
        granularity: params.granularity as 'hour' | 'day' | 'week' | 'month' | undefined,
        groupBy: (['repository', 'topic', 'integration'].includes(params.groupBy ?? '') ? params.groupBy : undefined) as GroupByOption | undefined,
    };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveIntegrationIds(reqCtx: AppRequestContext, event: APIGatewayProxyEventV2): string[] | null {
    const userIntegrationIds = reqCtx.appContext?.integrations ?? [];
    if (!userIntegrationIds.length) return null;

    const authorized = new Set(userIntegrationIds);
    const params = event.queryStringParameters ?? {};

    // Multi-select filter: keep only valid ids the user is actually assigned to.
    if (params.integrationIds) {
        const requested = params.integrationIds.split(',').filter((id) => UUID_RE.test(id) && authorized.has(id));
        if (requested.length > 0) return requested;
    }

    // Backward-compatible single-integration selection.
    if (params.integrationId && authorized.has(params.integrationId)) {
        return [params.integrationId];
    }

    return userIntegrationIds;
}

function jsonResponse(body: unknown, status: number = HttpStatusCodes.OK): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {'Content-Type': 'application/json'},
    });
}

router.get('/api/metrics/widget', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const event = reqCtx.event as APIGatewayProxyEventV2;
    const integrationIds = resolveIntegrationIds(reqCtx, event);
    if (!integrationIds) return jsonResponse({message: 'No integrations found for user'});

    const metricName = event.queryStringParameters?.metricName;
    if (!metricName || !VALID_METRIC_NAMES.has(metricName)) {
        throw new BadRequestError(`Invalid metric name. Valid values: ${[...VALID_METRIC_NAMES].join(', ')}`);
    }

    const filter = parseMetricsFilter(event);
    const metric = await getWidgetMetric({integrationIds, filter, metricName: metricName as MetricName});
    return jsonResponse(metric);
});

router.get('/api/metrics/repositories', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const event = reqCtx.event as APIGatewayProxyEventV2;
    const integrationIds = resolveIntegrationIds(reqCtx, event);
    if (!integrationIds) return jsonResponse([]);

    const repos = await listRepositories({integrationIds});
    return jsonResponse(repos);
});

router.get('/api/metrics/topics', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const event = reqCtx.event as APIGatewayProxyEventV2;
    const integrationIds = resolveIntegrationIds(reqCtx, event);
    if (!integrationIds) return jsonResponse([]);

    const topics = await listTopics({integrationIds});
    return jsonResponse(topics);
});

export default router;
