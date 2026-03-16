import {and, eq, gte, inArray, lte, sql, SQL} from 'drizzle-orm';
import {RdsTransaction, withRlsTransaction} from '../client';
import {pullRequests, repositories, user, workflowJobs, workflowRuns} from '../schema';
import type {MetricDataPoint, MetricResult, MetricsFilter, MetricSummary} from '../types/metrics';

type MetricsParams = {
    integrationIds: string[];
    filter: MetricsFilter;
};

const DEFAULT_DAYS = 90;

function getDateRange(filter: MetricsFilter): {from: Date; to: Date} {
    const to = filter.to ? new Date(filter.to) : new Date();
    const from = filter.from ? new Date(filter.from) : new Date(to.getTime() - DEFAULT_DAYS * 24 * 60 * 60 * 1000);
    return {from, to};
}

function getPreviousRange(from: Date, to: Date): {prevFrom: Date; prevTo: Date} {
    const duration = to.getTime() - from.getTime();
    return {prevFrom: new Date(from.getTime() - duration), prevTo: from};
}

function dateTruncExpression(granularity: string, column: SQL) {
    return sql`date_trunc(${sql.raw(`'${granularity}'`)}, ${column})`;
}

function buildSummary(data: MetricDataPoint[], prevData: MetricDataPoint[]): MetricSummary {
    const currentAvg = data.length > 0 ? data.reduce((s, d) => s + d.value, 0) / data.length : 0;
    const prevAvg = prevData.length > 0 ? prevData.reduce((s, d) => s + d.value, 0) / prevData.length : 0;

    const threshold = 0.05;
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (prevAvg > 0) {
        const change = (currentAvg - prevAvg) / prevAvg;
        if (change > threshold) trend = 'up';
        else if (change < -threshold) trend = 'down';
    } else if (currentAvg > 0) {
        trend = 'up';
    }

    return {
        current: Math.round(currentAvg * 100) / 100,
        previous: Math.round(prevAvg * 100) / 100,
        trend,
    };
}

function getEffectiveRepositoryIds(filter: MetricsFilter): number[] | undefined {
    if (filter.repositoryIds?.length) return filter.repositoryIds;
    if (filter.repositoryId) return [filter.repositoryId];
    return undefined;
}

function buildWorkflowRunConditions(filter: MetricsFilter, from: Date, to: Date): SQL[] {
    const conditions: SQL[] = [gte(workflowRuns.createdAt, from), lte(workflowRuns.createdAt, to), eq(workflowRuns.status, 'completed')];
    const repoIds = getEffectiveRepositoryIds(filter);
    if (repoIds) {
        conditions.push(repoIds.length === 1 ? eq(workflowRuns.repositoryId, repoIds[0]) : inArray(workflowRuns.repositoryId, repoIds));
    }
    if (filter.defaultBranchOnly) {
        conditions.push(
            sql`${workflowRuns.headBranch} = (SELECT ${repositories.defaultBranch} FROM ${repositories} WHERE ${repositories.id} = ${workflowRuns.repositoryId} AND ${repositories.integrationId} = ${workflowRuns.integrationId})`,
        );
    }
    if (filter.usersOnly) {
        conditions.push(sql`${workflowRuns.actorId} NOT IN (SELECT ${user.id} FROM ${user} WHERE ${user.type} = 'Bot')`);
    }
    return conditions;
}

function buildPullRequestFilters(conditions: SQL[], filter: MetricsFilter): void {
    const repoIds = getEffectiveRepositoryIds(filter);
    if (repoIds) {
        conditions.push(repoIds.length === 1 ? eq(pullRequests.repositoryId, repoIds[0]) : inArray(pullRequests.repositoryId, repoIds));
    }
    if (filter.defaultBranchOnly) {
        conditions.push(
            sql`${pullRequests.baseBranch} = (SELECT ${repositories.defaultBranch} FROM ${repositories} WHERE ${repositories.id} = ${pullRequests.repositoryId} AND ${repositories.integrationId} = ${pullRequests.integrationId})`,
        );
    }
    if (filter.usersOnly) {
        conditions.push(sql`${pullRequests.authorId} NOT IN (SELECT ${user.id} FROM ${user} WHERE ${user.type} = 'Bot')`);
    }
}

async function queryTimeBuckets(
    tx: RdsTransaction,
    selectExpr: SQL,
    fromTable: any,
    conditions: SQL[],
    granularity: string,
    dateColumn: SQL,
): Promise<MetricDataPoint[]> {
    const truncated = dateTruncExpression(granularity, dateColumn);
    const rows = await tx.execute(
        sql`SELECT ${truncated} as period, ${selectExpr} as value FROM ${fromTable} WHERE ${and(...conditions)} GROUP BY period ORDER BY period`,
    );
    return (rows.rows ?? []).map((r: any) => ({
        period: new Date(r.period).toISOString(),
        value: Number(r.value) || 0,
    }));
}

// --- DORA Metrics ---

export async function getDeploymentFrequency({integrationIds, filter}: MetricsParams): Promise<MetricResult> {
    const granularity = filter.granularity ?? 'week';
    const {from, to} = getDateRange(filter);
    const {prevFrom, prevTo} = getPreviousRange(from, to);

    return withRlsTransaction({
        integrationIds,
        callback: async (tx) => {
            const queryForRange = async (rangeFrom: Date, rangeTo: Date) => {
                const conditions = buildWorkflowRunConditions(filter, rangeFrom, rangeTo);
                conditions.push(eq(workflowRuns.conclusion, 'success'));
                return queryTimeBuckets(tx, sql`count(*)`, workflowRuns, conditions, granularity, sql`${workflowRuns.createdAt}`);
            };

            const data = await queryForRange(from, to);
            const prevData = await queryForRange(prevFrom, prevTo);

            return {metric: 'Deployment Frequency', unit: 'deployments', data, summary: buildSummary(data, prevData)};
        },
    });
}

export async function getLeadTimeForChanges({integrationIds, filter}: MetricsParams): Promise<MetricResult> {
    const granularity = filter.granularity ?? 'week';
    const {from, to} = getDateRange(filter);
    const {prevFrom, prevTo} = getPreviousRange(from, to);

    return withRlsTransaction({
        integrationIds,
        callback: async (tx) => {
            const queryForRange = async (rangeFrom: Date, rangeTo: Date) => {
                const conditions: SQL[] = [gte(pullRequests.mergedAt, rangeFrom), lte(pullRequests.mergedAt, rangeTo)];
                conditions.push(eq(pullRequests.merged, true));
                buildPullRequestFilters(conditions, filter);
                const truncated = dateTruncExpression(granularity, sql`${pullRequests.mergedAt}`);
                const rows = await tx.execute(
                    sql`SELECT ${truncated} as period, avg(extract(epoch from (${pullRequests.mergedAt} - ${pullRequests.createdAt})) / 3600) as value FROM ${pullRequests} WHERE ${and(...conditions)} GROUP BY period ORDER BY period`,
                );
                return (rows.rows ?? []).map((r: any) => ({
                    period: new Date(r.period).toISOString(),
                    value: Math.round((Number(r.value) || 0) * 100) / 100,
                }));
            };

            const data = await queryForRange(from, to);
            const prevData = await queryForRange(prevFrom, prevTo);

            return {metric: 'Lead Time for Changes', unit: 'hours', data, summary: buildSummary(data, prevData)};
        },
    });
}

export async function getChangeFailureRate({integrationIds, filter}: MetricsParams): Promise<MetricResult> {
    const granularity = filter.granularity ?? 'week';
    const {from, to} = getDateRange(filter);
    const {prevFrom, prevTo} = getPreviousRange(from, to);

    return withRlsTransaction({
        integrationIds,
        callback: async (tx) => {
            const queryForRange = async (rangeFrom: Date, rangeTo: Date) => {
                const conditions = buildWorkflowRunConditions(filter, rangeFrom, rangeTo);
                const truncated = dateTruncExpression(granularity, sql`${workflowRuns.createdAt}`);
                const rows = await tx.execute(
                    sql`SELECT ${truncated} as period, count(*) FILTER (WHERE ${workflowRuns.conclusion} IN ('failure', 'timed_out')) * 100.0 / NULLIF(count(*), 0) as value FROM ${workflowRuns} WHERE ${and(...conditions)} GROUP BY period ORDER BY period`,
                );
                return (rows.rows ?? []).map((r: any) => ({
                    period: new Date(r.period).toISOString(),
                    value: Math.round((Number(r.value) || 0) * 100) / 100,
                }));
            };

            const data = await queryForRange(from, to);
            const prevData = await queryForRange(prevFrom, prevTo);

            return {metric: 'Change Failure Rate', unit: '%', data, summary: buildSummary(data, prevData)};
        },
    });
}

export async function getMeanTimeToRecovery({integrationIds, filter}: MetricsParams): Promise<MetricResult> {
    const granularity = filter.granularity ?? 'week';
    const {from, to} = getDateRange(filter);
    const {prevFrom, prevTo} = getPreviousRange(from, to);

    return withRlsTransaction({
        integrationIds,
        callback: async (tx) => {
            const queryForRange = async (rangeFrom: Date, rangeTo: Date) => {
                // For each failed run, find the next successful run on the same workflow + branch
                // and compute the time difference
                const rows = await tx.execute(sql`
                    WITH failed_runs AS (
                        SELECT id, integration_id, workflow_id, head_branch, created_at
                        FROM github.workflow_runs
                        WHERE status = 'completed'
                          AND conclusion IN ('failure', 'timed_out')
                          AND created_at >= ${rangeFrom.toISOString()}::timestamptz
                          AND created_at <= ${rangeTo.toISOString()}::timestamptz
                          ${getEffectiveRepositoryIds(filter) ? sql`AND repository_id = ANY(${sql.raw(`ARRAY[${getEffectiveRepositoryIds(filter)!.join(',')}]`)})` : sql``}
                          ${filter.defaultBranchOnly ? sql`AND head_branch = (SELECT default_branch FROM github.repositories r WHERE r.id = github.workflow_runs.repository_id AND r.integration_id = github.workflow_runs.integration_id)` : sql``}
                          ${filter.usersOnly ? sql`AND actor_id NOT IN (SELECT id FROM github."user" WHERE type = 'Bot')` : sql``}
                    ),
                    recovery AS (
                        SELECT f.id as failed_id,
                               f.created_at as failed_at,
                               min(s.created_at) as recovered_at
                        FROM failed_runs f
                        JOIN github.workflow_runs s ON s.workflow_id = f.workflow_id
                            AND s.head_branch = f.head_branch
                            AND s.integration_id = f.integration_id
                            AND s.conclusion = 'success'
                            AND s.status = 'completed'
                            AND s.created_at > f.created_at
                        GROUP BY f.id, f.created_at
                    )
                    SELECT ${dateTruncExpression(granularity, sql`failed_at`)} as period,
                           avg(extract(epoch from (recovered_at - failed_at)) / 3600) as value
                    FROM recovery
                    GROUP BY period
                    ORDER BY period
                `);
                return (rows.rows ?? []).map((r: any) => ({
                    period: new Date(r.period).toISOString(),
                    value: Math.round((Number(r.value) || 0) * 100) / 100,
                }));
            };

            const data = await queryForRange(from, to);
            const prevData = await queryForRange(prevFrom, prevTo);

            return {metric: 'Mean Time to Recovery', unit: 'hours', data, summary: buildSummary(data, prevData)};
        },
    });
}

// --- SPACE Metrics ---

export async function getPRMergeRate({integrationIds, filter}: MetricsParams): Promise<MetricResult> {
    const granularity = filter.granularity ?? 'week';
    const {from, to} = getDateRange(filter);
    const {prevFrom, prevTo} = getPreviousRange(from, to);

    return withRlsTransaction({
        integrationIds,
        callback: async (tx) => {
            const queryForRange = async (rangeFrom: Date, rangeTo: Date) => {
                const conditions: SQL[] = [gte(pullRequests.closedAt, rangeFrom), lte(pullRequests.closedAt, rangeTo)];
                conditions.push(sql`${pullRequests.closedAt} IS NOT NULL`);
                buildPullRequestFilters(conditions, filter);
                const truncated = dateTruncExpression(granularity, sql`${pullRequests.closedAt}`);
                const rows = await tx.execute(
                    sql`SELECT ${truncated} as period, count(*) FILTER (WHERE ${pullRequests.merged} = true) * 100.0 / NULLIF(count(*), 0) as value FROM ${pullRequests} WHERE ${and(...conditions)} GROUP BY period ORDER BY period`,
                );
                return (rows.rows ?? []).map((r: any) => ({
                    period: new Date(r.period).toISOString(),
                    value: Math.round((Number(r.value) || 0) * 100) / 100,
                }));
            };

            const data = await queryForRange(from, to);
            const prevData = await queryForRange(prevFrom, prevTo);

            return {metric: 'PR Merge Rate', unit: '%', data, summary: buildSummary(data, prevData)};
        },
    });
}

export async function getActivityVolume({integrationIds, filter}: MetricsParams): Promise<MetricResult> {
    const granularity = filter.granularity ?? 'week';
    const {from, to} = getDateRange(filter);
    const {prevFrom, prevTo} = getPreviousRange(from, to);

    return withRlsTransaction({
        integrationIds,
        callback: async (tx) => {
            const queryForRange = async (rangeFrom: Date, rangeTo: Date) => {
                // Combine PR + workflow run counts
                const rows = await tx.execute(sql`
                    SELECT period, sum(cnt) as value FROM (
                        SELECT ${dateTruncExpression(granularity, sql`${workflowRuns.createdAt}`)} as period, count(*) as cnt
                        FROM ${workflowRuns}
                        WHERE ${workflowRuns.createdAt} >= ${rangeFrom.toISOString()}::timestamptz
                          AND ${workflowRuns.createdAt} <= ${rangeTo.toISOString()}::timestamptz
                          ${getEffectiveRepositoryIds(filter) ? sql`AND ${workflowRuns.repositoryId} = ANY(${sql.raw(`ARRAY[${getEffectiveRepositoryIds(filter)!.join(',')}]`)})` : sql``}
                          ${filter.defaultBranchOnly ? sql`AND ${workflowRuns.headBranch} = (SELECT ${repositories.defaultBranch} FROM ${repositories} WHERE ${repositories.id} = ${workflowRuns.repositoryId} AND ${repositories.integrationId} = ${workflowRuns.integrationId})` : sql``}
                          ${filter.usersOnly ? sql`AND ${workflowRuns.actorId} NOT IN (SELECT id FROM github."user" WHERE type = 'Bot')` : sql``}
                        GROUP BY period
                        UNION ALL
                        SELECT ${dateTruncExpression(granularity, sql`${pullRequests.createdAt}`)} as period, count(*) as cnt
                        FROM ${pullRequests}
                        WHERE ${pullRequests.createdAt} >= ${rangeFrom.toISOString()}::timestamptz
                          AND ${pullRequests.createdAt} <= ${rangeTo.toISOString()}::timestamptz
                          ${getEffectiveRepositoryIds(filter) ? sql`AND ${pullRequests.repositoryId} = ANY(${sql.raw(`ARRAY[${getEffectiveRepositoryIds(filter)!.join(',')}]`)})` : sql``}
                          ${filter.defaultBranchOnly ? sql`AND ${pullRequests.baseBranch} = (SELECT ${repositories.defaultBranch} FROM ${repositories} WHERE ${repositories.id} = ${pullRequests.repositoryId} AND ${repositories.integrationId} = ${pullRequests.integrationId})` : sql``}
                          ${filter.usersOnly ? sql`AND ${pullRequests.authorId} NOT IN (SELECT id FROM github."user" WHERE type = 'Bot')` : sql``}
                        GROUP BY period
                    ) combined
                    GROUP BY period
                    ORDER BY period
                `);
                return (rows.rows ?? []).map((r: any) => ({
                    period: new Date(r.period).toISOString(),
                    value: Number(r.value) || 0,
                }));
            };

            const data = await queryForRange(from, to);
            const prevData = await queryForRange(prevFrom, prevTo);

            return {metric: 'Activity Volume', unit: 'events', data, summary: buildSummary(data, prevData)};
        },
    });
}

export async function getContributorCount({integrationIds, filter}: MetricsParams): Promise<MetricResult> {
    const granularity = filter.granularity ?? 'week';
    const {from, to} = getDateRange(filter);
    const {prevFrom, prevTo} = getPreviousRange(from, to);

    return withRlsTransaction({
        integrationIds,
        callback: async (tx) => {
            const queryForRange = async (rangeFrom: Date, rangeTo: Date) => {
                const rows = await tx.execute(sql`
                    SELECT period, count(DISTINCT actor) as value FROM (
                        SELECT ${dateTruncExpression(granularity, sql`${workflowRuns.createdAt}`)} as period, ${workflowRuns.actorId} as actor
                        FROM ${workflowRuns}
                        WHERE ${workflowRuns.createdAt} >= ${rangeFrom.toISOString()}::timestamptz
                          AND ${workflowRuns.createdAt} <= ${rangeTo.toISOString()}::timestamptz
                          ${getEffectiveRepositoryIds(filter) ? sql`AND ${workflowRuns.repositoryId} = ANY(${sql.raw(`ARRAY[${getEffectiveRepositoryIds(filter)!.join(',')}]`)})` : sql``}
                          ${filter.defaultBranchOnly ? sql`AND ${workflowRuns.headBranch} = (SELECT ${repositories.defaultBranch} FROM ${repositories} WHERE ${repositories.id} = ${workflowRuns.repositoryId} AND ${repositories.integrationId} = ${workflowRuns.integrationId})` : sql``}
                          ${filter.usersOnly ? sql`AND ${workflowRuns.actorId} NOT IN (SELECT id FROM github."user" WHERE type = 'Bot')` : sql``}
                        UNION ALL
                        SELECT ${dateTruncExpression(granularity, sql`${pullRequests.createdAt}`)} as period, ${pullRequests.authorId} as actor
                        FROM ${pullRequests}
                        WHERE ${pullRequests.createdAt} >= ${rangeFrom.toISOString()}::timestamptz
                          AND ${pullRequests.createdAt} <= ${rangeTo.toISOString()}::timestamptz
                          ${getEffectiveRepositoryIds(filter) ? sql`AND ${pullRequests.repositoryId} = ANY(${sql.raw(`ARRAY[${getEffectiveRepositoryIds(filter)!.join(',')}]`)})` : sql``}
                          ${filter.defaultBranchOnly ? sql`AND ${pullRequests.baseBranch} = (SELECT ${repositories.defaultBranch} FROM ${repositories} WHERE ${repositories.id} = ${pullRequests.repositoryId} AND ${repositories.integrationId} = ${pullRequests.integrationId})` : sql``}
                          ${filter.usersOnly ? sql`AND ${pullRequests.authorId} NOT IN (SELECT id FROM github."user" WHERE type = 'Bot')` : sql``}
                    ) combined
                    GROUP BY period
                    ORDER BY period
                `);
                return (rows.rows ?? []).map((r: any) => ({
                    period: new Date(r.period).toISOString(),
                    value: Number(r.value) || 0,
                }));
            };

            const data = await queryForRange(from, to);
            const prevData = await queryForRange(prevFrom, prevTo);

            return {metric: 'Contributor Count', unit: 'contributors', data, summary: buildSummary(data, prevData)};
        },
    });
}

export async function getCIDuration({integrationIds, filter}: MetricsParams): Promise<MetricResult> {
    const granularity = filter.granularity ?? 'week';
    const {from, to} = getDateRange(filter);
    const {prevFrom, prevTo} = getPreviousRange(from, to);

    return withRlsTransaction({
        integrationIds,
        callback: async (tx) => {
            const queryForRange = async (rangeFrom: Date, rangeTo: Date) => {
                const conditions: SQL[] = [
                    gte(workflowJobs.createdAt, rangeFrom),
                    lte(workflowJobs.createdAt, rangeTo),
                    sql`${workflowJobs.completedAt} IS NOT NULL`,
                ];
                const repoIds = getEffectiveRepositoryIds(filter);
                if (repoIds) {
                    conditions.push(repoIds.length === 1 ? eq(workflowJobs.repositoryId, repoIds[0]) : inArray(workflowJobs.repositoryId, repoIds));
                }
                const truncated = dateTruncExpression(granularity, sql`${workflowJobs.createdAt}`);
                const rows = await tx.execute(
                    sql`SELECT ${truncated} as period, avg(extract(epoch from (${workflowJobs.completedAt} - ${workflowJobs.startedAt})) / 60) as value FROM ${workflowJobs} WHERE ${and(...conditions)} GROUP BY period ORDER BY period`,
                );
                return (rows.rows ?? []).map((r: any) => ({
                    period: new Date(r.period).toISOString(),
                    value: Math.round((Number(r.value) || 0) * 100) / 100,
                }));
            };

            const data = await queryForRange(from, to);
            const prevData = await queryForRange(prevFrom, prevTo);

            return {metric: 'CI Duration', unit: 'minutes', data, summary: buildSummary(data, prevData)};
        },
    });
}

export async function getPRCycleTime({integrationIds, filter}: MetricsParams): Promise<MetricResult> {
    const granularity = filter.granularity ?? 'week';
    const {from, to} = getDateRange(filter);
    const {prevFrom, prevTo} = getPreviousRange(from, to);

    return withRlsTransaction({
        integrationIds,
        callback: async (tx) => {
            const queryForRange = async (rangeFrom: Date, rangeTo: Date) => {
                const conditions: SQL[] = [gte(pullRequests.mergedAt, rangeFrom), lte(pullRequests.mergedAt, rangeTo)];
                conditions.push(eq(pullRequests.merged, true));
                buildPullRequestFilters(conditions, filter);
                const truncated = dateTruncExpression(granularity, sql`${pullRequests.mergedAt}`);
                const rows = await tx.execute(
                    sql`SELECT ${truncated} as period, avg(extract(epoch from (${pullRequests.mergedAt} - ${pullRequests.createdAt})) / 3600) as value FROM ${pullRequests} WHERE ${and(...conditions)} GROUP BY period ORDER BY period`,
                );
                return (rows.rows ?? []).map((r: any) => ({
                    period: new Date(r.period).toISOString(),
                    value: Math.round((Number(r.value) || 0) * 100) / 100,
                }));
            };

            const data = await queryForRange(from, to);
            const prevData = await queryForRange(prevFrom, prevTo);

            return {metric: 'PR Cycle Time', unit: 'hours', data, summary: buildSummary(data, prevData)};
        },
    });
}

export async function getWorkflowQueueTime({integrationIds, filter}: MetricsParams): Promise<MetricResult> {
    const granularity = filter.granularity ?? 'week';
    const {from, to} = getDateRange(filter);
    const {prevFrom, prevTo} = getPreviousRange(from, to);

    return withRlsTransaction({
        integrationIds,
        callback: async (tx) => {
            const queryForRange = async (rangeFrom: Date, rangeTo: Date) => {
                const conditions: SQL[] = [gte(workflowJobs.createdAt, rangeFrom), lte(workflowJobs.createdAt, rangeTo)];
                const repoIds = getEffectiveRepositoryIds(filter);
                if (repoIds) {
                    conditions.push(repoIds.length === 1 ? eq(workflowJobs.repositoryId, repoIds[0]) : inArray(workflowJobs.repositoryId, repoIds));
                }
                const truncated = dateTruncExpression(granularity, sql`${workflowJobs.createdAt}`);
                const rows = await tx.execute(
                    sql`SELECT ${truncated} as period, avg(extract(epoch from (${workflowJobs.startedAt} - ${workflowJobs.createdAt})) / 60) as value FROM ${workflowJobs} WHERE ${and(...conditions)} GROUP BY period ORDER BY period`,
                );
                return (rows.rows ?? []).map((r: any) => ({
                    period: new Date(r.period).toISOString(),
                    value: Math.round((Number(r.value) || 0) * 100) / 100,
                }));
            };

            const data = await queryForRange(from, to);
            const prevData = await queryForRange(prevFrom, prevTo);

            return {metric: 'Workflow Queue Time', unit: 'minutes', data, summary: buildSummary(data, prevData)};
        },
    });
}

// --- Filter option lists ---

export async function listRepositories({integrationIds}: {integrationIds: string[]}) {
    return withRlsTransaction({
        integrationIds,
        callback: async (tx) => {
            const rows = await tx.select({id: repositories.id, name: repositories.name}).from(repositories).orderBy(repositories.name);
            return rows;
        },
    });
}
