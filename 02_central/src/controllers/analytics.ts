import {runAthenaQuery} from '@/clients/athena';
import {BadRequestError} from '@aws-lambda-powertools/event-handler/http';
import {JobMetricsParameters, JobMetricsResponse, MetricsParameterDimension, MetricsParameterStat} from '@common/types/metrics';

const athenaJobsTable = process.env.ATHENA_JOBS_TABLE;
if (!athenaJobsTable) {
    throw new Error('ATHENA_JOBS_TABLE environment variable is not set');
}

const DIMENSION_SEPARATOR = ':';

export const getJobMetrics = async (cognitoGroups: string[], params: JobMetricsParameters): Promise<JobMetricsResponse> => {
    const integrationValues = (() => {
        const found = params.filters.find((filter) => filter.name === MetricsParameterDimension.INTEGRATION_ID);
        if (!found || found.values.length === 0) {
            return cognitoGroups;
        }
        return found.values.filter((id) => cognitoGroups.includes(id));
    })();

    const filters: JobMetricsParameters['filters'] = [
        {
            name: MetricsParameterDimension.INTEGRATION_ID,
            values: Array.from(new Set(integrationValues)),
        },
        ...params.filters.filter((filter) => filter.name !== MetricsParameterDimension.INTEGRATION_ID),
    ];

    if (params.stat !== MetricsParameterStat.SUM) {
        throw new BadRequestError('Unsupported stat; only sum is supported at this time');
    }

    if (filters[0].values.length === 0) {
        return {series: []};
    }

    const {period, range} = params;

    const filterExpressions = [
        `completed_at >= from_unixtime(${range.start})`,
        `completed_at <= from_unixtime(${range.end})`,
        ...filters.map((filter) => buildFilterClause(filter.name, filter.values)),
    ].filter(Boolean);

    const bucketExpr = `cast(floor(to_unixtime(completed_at) / ${period}) * ${period} as bigint)`;

    const selectColumns = [`${bucketExpr} AS bucket_start`, ...(params.dimensions ?? []), 'COUNT(*) AS value'];
    const groupByColumns = ['1', ...params.dimensions.map((_, idx) => `${idx + 2}`)];
    const orderByColumns = ['1', ...params.dimensions.map((_, idx) => `${idx + 2}`)];

    const query = `
        SELECT
            ${selectColumns.join(', ')}
        FROM ${athenaJobsTable}
        WHERE ${filterExpressions.join(' AND ')}
        GROUP BY ${groupByColumns.join(', ')}
        ORDER BY ${orderByColumns.join(', ')};
    `;

    const rows = await runAthenaQuery({
        query,
        mapRow: (row) => ({
            bucket: Number(row.bucket_start ?? 0),
            value: Number(row.value ?? 0),
            dimensions: params.dimensions.map((dim) => String((row as Record<string, unknown>)[dim] ?? '')),
        }),
    });

    const allBuckets = new Set<number>();
    const groupMap = new Map<string, Map<number, number>>();

    rows.forEach((row) => {
        allBuckets.add(row.bucket);
        const key = row.dimensions.join(DIMENSION_SEPARATOR);
        const bucketMap = groupMap.get(key) ?? new Map<number, number>();
        bucketMap.set(row.bucket, (bucketMap.get(row.bucket) ?? 0) + row.value);
        groupMap.set(key, bucketMap);
    });

    const timestamps = Array.from(allBuckets.values()).sort((a, b) => a - b);
    const groupKeys = Array.from(groupMap.keys()).sort();

    const values = timestamps.map((ts) => groupKeys.map((key) => groupMap.get(key)?.get(ts) ?? null));

    const groups = groupKeys.map((key) => {
        if (params.dimensions.length === 0) {
            return {dimensions: []};
        }
        const parts = key ? key.split(DIMENSION_SEPARATOR) : [];
        return {dimensions: parts.map((val, idx) => `${params.dimensions[idx]}:${val}`)};
    });

    return {series: [{timestamps, groups, values}]};
};

const buildFilterClause = (name: string, values: string[]): string => {
    const sanitized = values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ');
    return `${name} IN (${sanitized})`;
};
