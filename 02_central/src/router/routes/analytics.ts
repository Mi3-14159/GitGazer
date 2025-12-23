import {getJobMetrics} from '@/controllers/analytics';
import {Router} from '@/router/router';
import {isJobMetricsParameters} from '@common/types/metrics';

const router = new Router();

router.post('/api/analytics/jobs/metrics', async (event) => {
    const groups: string[] = (event.requestContext.authorizer.jwt.claims['cognito:groups'] as string[]) ?? [];

    if (!event.body) {
        return {
            statusCode: 400,
            body: JSON.stringify({message: 'Request body is required'}),
            headers: {
                'Content-Type': 'application/json',
            },
        };
    }

    let parsedBody: unknown;
    try {
        parsedBody = JSON.parse(event.body);
    } catch (error) {
        return {
            statusCode: 400,
            body: JSON.stringify({message: 'Invalid JSON body'}),
            headers: {
                'Content-Type': 'application/json',
            },
        };
    }

    if (!isJobMetricsParameters(parsedBody)) {
        return {
            statusCode: 400,
            body: JSON.stringify({message: 'Invalid metrics request parameters'}),
            headers: {
                'Content-Type': 'application/json',
            },
        };
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
        const metrics = await getJobMetrics(groups, parsedBody);

        return {
            statusCode: 200,
            body: JSON.stringify(metrics),
            headers: {
                'Content-Type': 'application/json',
            },
        };
    } catch (error) {
        return {
            statusCode: 400,
            body: JSON.stringify({message: error instanceof Error ? error.message : 'Invalid metrics request'}),
            headers: {
                'Content-Type': 'application/json',
            },
        };
    }
});

export default router;
