import {and, eq, gte, inArray, lte, sql, SQL} from 'drizzle-orm';
import {RdsTransaction, withRlsTransaction} from '../client';
import {pullRequestReviews, pullRequests, repositories, user, workflowJobs, workflowRuns} from '../schema';
import type {MetricDataPoint, MetricResult, MetricSeries, MetricsFilter} from '../types/metrics';

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

function dateTruncExpression(granularity: string, column: SQL) {
    return sql`date_trunc(${sql.raw(`'${granularity}'`)}, ${column})`;
}

function getEffectiveRepositoryIds(filter: MetricsFilter): number[] | undefined {
    if (filter.repositoryIds?.length) return filter.repositoryIds;
    if (filter.repositoryId) return [filter.repositoryId];
    return undefined;
}

function buildTopicsCondition(
    repositoryIdColumn: SQL | typeof workflowRuns.repositoryId | typeof pullRequests.repositoryId | typeof workflowJobs.repositoryId,
    integrationIdColumn: SQL | typeof workflowRuns.integrationId | typeof pullRequests.integrationId | typeof workflowJobs.integrationId,
    topics: string[],
): SQL {
    const topicParams = sql.join(
        topics.map((t) => sql`${t}`),
        sql`, `,
    );
    return sql`${repositoryIdColumn} IN (
        SELECT ${repositories.id} FROM ${repositories}
        WHERE ${repositories.integrationId} = ${integrationIdColumn}
        AND ${repositories.topics} ?| array[${topicParams}]
    )`;
}

function getGroupByExpressions(filter: MetricsFilter): {select: SQL; join: SQL} | null {
    if (filter.groupBy === 'repository') {
        return {
            select: sql`${repositories.id}::text as group_key, ${repositories.name} as group_label`,
            join: sql``,
        };
    }
    if (filter.groupBy === 'topic') {
        return {
            select: sql`t.topic as group_key, t.topic as group_label`,
            join: sql`CROSS JOIN LATERAL jsonb_array_elements_text(${repositories.topics}) AS t(topic)`,
        };
    }
    return null;
}

function buildWorkflowRunConditions(filter: MetricsFilter, from: Date, to: Date): SQL[] {
    const conditions: SQL[] = [gte(workflowRuns.createdAt, from), lte(workflowRuns.createdAt, to), eq(workflowRuns.status, 'completed')];
    const repoIds = getEffectiveRepositoryIds(filter);
    if (repoIds) {
        conditions.push(repoIds.length === 1 ? eq(workflowRuns.repositoryId, repoIds[0]) : inArray(workflowRuns.repositoryId, repoIds));
    }
    if (filter.topics?.length) {
        conditions.push(buildTopicsCondition(workflowRuns.repositoryId, workflowRuns.integrationId, filter.topics));
    }
    if (filter.defaultBranchOnly) {
        conditions.push(
            sql`${workflowRuns.headBranch} = (SELECT ${repositories.defaultBranch} FROM ${repositories} WHERE ${repositories.id} = ${workflowRuns.repositoryId} AND ${repositories.integrationId} = ${workflowRuns.integrationId})`,
        );
    }
    if (filter.usersOnly) {
        conditions.push(sql`${workflowRuns.actorId} IN (SELECT ${user.id} FROM ${user} WHERE ${user.type} = 'User')`);
    }
    return conditions;
}

function buildWorkflowJobConditions(filter: MetricsFilter, from: Date, to: Date): SQL[] {
    const conditions: SQL[] = [gte(workflowJobs.createdAt, from), lte(workflowJobs.createdAt, to), sql`${workflowJobs.completedAt} IS NOT NULL`];
    const repoIds = getEffectiveRepositoryIds(filter);
    if (repoIds) {
        conditions.push(repoIds.length === 1 ? eq(workflowJobs.repositoryId, repoIds[0]) : inArray(workflowJobs.repositoryId, repoIds));
    }
    if (filter.topics?.length) {
        conditions.push(buildTopicsCondition(workflowJobs.repositoryId, workflowJobs.integrationId, filter.topics));
    }
    if (filter.defaultBranchOnly) {
        conditions.push(
            sql`${workflowJobs.headBranch} = (SELECT ${repositories.defaultBranch} FROM ${repositories} WHERE ${repositories.id} = ${workflowJobs.repositoryId} AND ${repositories.integrationId} = ${workflowJobs.integrationId})`,
        );
    }
    if (filter.usersOnly) {
        conditions.push(
            sql`${workflowJobs.workflowRunId} IN (SELECT ${workflowRuns.id} FROM ${workflowRuns} WHERE ${workflowRuns.integrationId} = ${workflowJobs.integrationId} AND ${workflowRuns.id} = ${workflowJobs.workflowRunId} AND ${workflowRuns.actorId} IN (SELECT ${user.id} FROM ${user} WHERE ${user.type} = 'User'))`,
        );
    }
    return conditions;
}

function buildPullRequestFilters(conditions: SQL[], filter: MetricsFilter): void {
    const repoIds = getEffectiveRepositoryIds(filter);
    if (repoIds) {
        conditions.push(repoIds.length === 1 ? eq(pullRequests.repositoryId, repoIds[0]) : inArray(pullRequests.repositoryId, repoIds));
    }
    if (filter.topics?.length) {
        conditions.push(buildTopicsCondition(pullRequests.repositoryId, pullRequests.integrationId, filter.topics));
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

type GroupedRow = {group_key: string; group_label: string; period: string; value: number};

function parseGroupedRows(rows: any[]): GroupedRow[] {
    return rows.map((r: any) => ({
        group_key: String(r.group_key),
        group_label: String(r.group_label),
        period: new Date(r.period).toISOString(),
        value: Math.round((Number(r.value) || 0) * 100) / 100,
    }));
}

function groupRowsIntoSeries(rows: GroupedRow[]): MetricSeries[] {
    const groups = new Map<string, {label: string; data: MetricDataPoint[]}>();
    for (const r of rows) {
        if (!groups.has(r.group_key)) groups.set(r.group_key, {label: r.group_label, data: []});
        groups.get(r.group_key)!.data.push({period: r.period, value: r.value});
    }
    return Array.from(groups.entries()).map(([key, {label, data}]) => ({
        groupKey: key,
        groupLabel: label,
        data,
    }));
}

function buildUnionFilters(filter: MetricsFilter, repoIds: number[] | undefined) {
    const wrRepoFilter = repoIds ? sql`AND ${workflowRuns.repositoryId} = ANY(${sql.raw(`ARRAY[${repoIds.join(',')}]`)})` : sql``;
    const prRepoFilter = repoIds ? sql`AND ${pullRequests.repositoryId} = ANY(${sql.raw(`ARRAY[${repoIds.join(',')}]`)})` : sql``;
    const wrBranchFilter = filter.defaultBranchOnly
        ? sql`AND ${workflowRuns.headBranch} = (SELECT ${repositories.defaultBranch} FROM ${repositories} WHERE ${repositories.id} = ${workflowRuns.repositoryId} AND ${repositories.integrationId} = ${workflowRuns.integrationId})`
        : sql``;
    const prBranchFilter = filter.defaultBranchOnly
        ? sql`AND ${pullRequests.baseBranch} = (SELECT ${repositories.defaultBranch} FROM ${repositories} WHERE ${repositories.id} = ${pullRequests.repositoryId} AND ${repositories.integrationId} = ${pullRequests.integrationId})`
        : sql``;
    const wrUserFilter = filter.usersOnly ? sql`AND ${workflowRuns.actorId} NOT IN (SELECT id FROM github."user" WHERE type = 'Bot')` : sql``;
    const prUserFilter = filter.usersOnly ? sql`AND ${pullRequests.authorId} NOT IN (SELECT id FROM github."user" WHERE type = 'Bot')` : sql``;
    return {wrRepoFilter, prRepoFilter, wrBranchFilter, prBranchFilter, wrUserFilter, prUserFilter};
}

// --- DORA Metrics ---

export async function getDeploymentFrequency({integrationIds, filter}: MetricsParams): Promise<MetricResult> {
    const granularity = filter.granularity ?? 'week';
    const {from, to} = getDateRange(filter);

    return withRlsTransaction({
        integrationIds,
        callback: async (tx) => {
            const conditions = buildWorkflowRunConditions(filter, from, to);
            conditions.push(eq(workflowRuns.conclusion, 'success'));
            const groupExprs = getGroupByExpressions(filter);

            if (groupExprs) {
                const truncated = dateTruncExpression(granularity, sql`${workflowRuns.createdAt}`);
                const rows = await tx.execute(
                    sql`SELECT ${groupExprs.select}, ${truncated} as period, count(*) as value
                    FROM ${workflowRuns}
                    INNER JOIN ${repositories} ON ${repositories.id} = ${workflowRuns.repositoryId} AND ${repositories.integrationId} = ${workflowRuns.integrationId}
                    ${groupExprs.join}
                    WHERE ${and(...conditions)}
                    GROUP BY group_key, group_label, period
                    ORDER BY group_label, period`,
                );
                const series = groupRowsIntoSeries(parseGroupedRows(rows.rows ?? []));
                return {metric: 'Deployment Frequency', unit: 'deployments', data: [], series};
            }

            const data = await queryTimeBuckets(tx, sql`count(*)`, workflowRuns, conditions, granularity, sql`${workflowRuns.createdAt}`);
            return {metric: 'Deployment Frequency', unit: 'deployments', data};
        },
    });
}

export async function getLeadTimeForChanges({integrationIds, filter}: MetricsParams): Promise<MetricResult> {
    const granularity = filter.granularity ?? 'week';
    const {from, to} = getDateRange(filter);

    return withRlsTransaction({
        integrationIds,
        callback: async (tx) => {
            const conditions: SQL[] = [gte(pullRequests.mergedAt, from), lte(pullRequests.mergedAt, to)];
            conditions.push(eq(pullRequests.merged, true));
            buildPullRequestFilters(conditions, filter);
            const groupExprs = getGroupByExpressions(filter);
            const truncated = dateTruncExpression(granularity, sql`${pullRequests.mergedAt}`);

            if (groupExprs) {
                const rows = await tx.execute(
                    sql`SELECT ${groupExprs.select}, ${truncated} as period, avg(extract(epoch from (${pullRequests.mergedAt} - ${pullRequests.createdAt})) / 3600) as value FROM ${pullRequests} INNER JOIN ${repositories} ON ${repositories.id} = ${pullRequests.repositoryId} AND ${repositories.integrationId} = ${pullRequests.integrationId} ${groupExprs.join} WHERE ${and(...conditions)} GROUP BY group_key, group_label, period ORDER BY group_label, period`,
                );
                const series = groupRowsIntoSeries(parseGroupedRows(rows.rows ?? []));
                return {metric: 'Lead Time for Changes', unit: 'hours', data: [], series};
            }

            const rows = await tx.execute(
                sql`SELECT ${truncated} as period, avg(extract(epoch from (${pullRequests.mergedAt} - ${pullRequests.createdAt})) / 3600) as value FROM ${pullRequests} WHERE ${and(...conditions)} GROUP BY period ORDER BY period`,
            );
            const data = (rows.rows ?? []).map((r: any) => ({
                period: new Date(r.period).toISOString(),
                value: Math.round((Number(r.value) || 0) * 100) / 100,
            }));
            return {metric: 'Lead Time for Changes', unit: 'hours', data};
        },
    });
}

export async function getChangeFailureRate({integrationIds, filter}: MetricsParams): Promise<MetricResult> {
    const granularity = filter.granularity ?? 'week';
    const {from, to} = getDateRange(filter);

    return withRlsTransaction({
        integrationIds,
        callback: async (tx) => {
            const conditions = buildWorkflowRunConditions(filter, from, to);
            const groupExprs = getGroupByExpressions(filter);
            const truncated = dateTruncExpression(granularity, sql`${workflowRuns.createdAt}`);

            if (groupExprs) {
                const rows = await tx.execute(
                    sql`SELECT ${groupExprs.select}, ${truncated} as period, count(*) FILTER (WHERE ${workflowRuns.conclusion} IN ('failure', 'timed_out')) * 100.0 / NULLIF(count(*), 0) as value FROM ${workflowRuns} INNER JOIN ${repositories} ON ${repositories.id} = ${workflowRuns.repositoryId} AND ${repositories.integrationId} = ${workflowRuns.integrationId} ${groupExprs.join} WHERE ${and(...conditions)} GROUP BY group_key, group_label, period ORDER BY group_label, period`,
                );
                const series = groupRowsIntoSeries(parseGroupedRows(rows.rows ?? []));
                return {metric: 'Change Failure Rate', unit: '%', data: [], series};
            }

            const rows = await tx.execute(
                sql`SELECT ${truncated} as period, count(*) FILTER (WHERE ${workflowRuns.conclusion} IN ('failure', 'timed_out')) * 100.0 / NULLIF(count(*), 0) as value FROM ${workflowRuns} WHERE ${and(...conditions)} GROUP BY period ORDER BY period`,
            );
            const data = (rows.rows ?? []).map((r: any) => ({
                period: new Date(r.period).toISOString(),
                value: Math.round((Number(r.value) || 0) * 100) / 100,
            }));
            return {metric: 'Change Failure Rate', unit: '%', data};
        },
    });
}

export async function getMeanTimeToRecovery({integrationIds, filter}: MetricsParams): Promise<MetricResult> {
    const granularity = filter.granularity ?? 'week';
    const {from, to} = getDateRange(filter);

    return withRlsTransaction({
        integrationIds,
        callback: async (tx) => {
            const repoIds = getEffectiveRepositoryIds(filter);
            const repoFilter = repoIds ? sql`AND repository_id = ANY(${sql.raw(`ARRAY[${repoIds.join(',')}]`)})` : sql``;
            const topicsFilter = filter.topics?.length
                ? sql`AND repository_id IN (SELECT r.id FROM github.repositories r WHERE r.integration_id = github.workflow_runs.integration_id AND r.topics ?| array[${sql.join(
                      filter.topics.map((t) => sql`${t}`),
                      sql`, `,
                  )}])`
                : sql``;
            const branchFilter = filter.defaultBranchOnly
                ? sql`AND head_branch = (SELECT default_branch FROM github.repositories r WHERE r.id = github.workflow_runs.repository_id AND r.integration_id = github.workflow_runs.integration_id)`
                : sql``;
            const userFilter = filter.usersOnly ? sql`AND actor_id NOT IN (SELECT id FROM github."user" WHERE type = 'Bot')` : sql``;

            if (filter.groupBy === 'repository' || filter.groupBy === 'topic') {
                const isTopicGroup = filter.groupBy === 'topic';
                const rows = await tx.execute(sql`
                    WITH failed_runs AS (
                        SELECT id, integration_id, workflow_id, head_branch, created_at, repository_id
                        FROM github.workflow_runs
                        WHERE status = 'completed'
                          AND conclusion IN ('failure', 'timed_out')
                          AND created_at >= ${from.toISOString()}::timestamptz
                          AND created_at <= ${to.toISOString()}::timestamptz
                          ${repoFilter} ${topicsFilter} ${branchFilter} ${userFilter}
                    ),
                    recovery AS (
                        SELECT f.id as failed_id, f.created_at as failed_at, f.repository_id, min(s.created_at) as recovered_at
                        FROM failed_runs f
                        JOIN github.workflow_runs s ON s.workflow_id = f.workflow_id AND s.head_branch = f.head_branch AND s.integration_id = f.integration_id AND s.conclusion = 'success' AND s.status = 'completed' AND s.created_at > f.created_at
                        GROUP BY f.id, f.created_at, f.repository_id
                    )
                    SELECT ${isTopicGroup ? sql`t.topic as group_key, t.topic as group_label` : sql`r.id::text as group_key, r.name as group_label`},
                           ${dateTruncExpression(granularity, sql`failed_at`)} as period,
                           avg(extract(epoch from (recovered_at - failed_at)) / 3600) as value
                    FROM recovery
                    JOIN github.repositories r ON r.id = recovery.repository_id
                    ${isTopicGroup ? sql.raw(`CROSS JOIN LATERAL jsonb_array_elements_text(r.topics) AS t(topic)`) : sql``}
                    GROUP BY group_key, group_label, period
                    ORDER BY group_label, period
                `);
                const series = groupRowsIntoSeries(parseGroupedRows(rows.rows ?? []));
                return {metric: 'Mean Time to Recovery', unit: 'hours', data: [], series};
            }

            const rows = await tx.execute(sql`
                WITH failed_runs AS (
                    SELECT id, integration_id, workflow_id, head_branch, created_at
                    FROM github.workflow_runs
                    WHERE status = 'completed'
                      AND conclusion IN ('failure', 'timed_out')
                      AND created_at >= ${from.toISOString()}::timestamptz
                      AND created_at <= ${to.toISOString()}::timestamptz
                      ${repoFilter} ${topicsFilter} ${branchFilter} ${userFilter}
                ),
                recovery AS (
                    SELECT f.id as failed_id, f.created_at as failed_at, min(s.created_at) as recovered_at
                    FROM failed_runs f
                    JOIN github.workflow_runs s ON s.workflow_id = f.workflow_id AND s.head_branch = f.head_branch AND s.integration_id = f.integration_id AND s.conclusion = 'success' AND s.status = 'completed' AND s.created_at > f.created_at
                    GROUP BY f.id, f.created_at
                )
                SELECT ${dateTruncExpression(granularity, sql`failed_at`)} as period,
                       avg(extract(epoch from (recovered_at - failed_at)) / 3600) as value
                FROM recovery
                GROUP BY period
                ORDER BY period
            `);
            const data = (rows.rows ?? []).map((r: any) => ({
                period: new Date(r.period).toISOString(),
                value: Math.round((Number(r.value) || 0) * 100) / 100,
            }));
            return {metric: 'Mean Time to Recovery', unit: 'hours', data};
        },
    });
}

// --- SPACE Metrics ---

export async function getPRMergeRate({integrationIds, filter}: MetricsParams): Promise<MetricResult> {
    const granularity = filter.granularity ?? 'week';
    const {from, to} = getDateRange(filter);

    return withRlsTransaction({
        integrationIds,
        callback: async (tx) => {
            const conditions: SQL[] = [gte(pullRequests.closedAt, from), lte(pullRequests.closedAt, to)];
            conditions.push(sql`${pullRequests.closedAt} IS NOT NULL`);
            buildPullRequestFilters(conditions, filter);
            const groupExprs = getGroupByExpressions(filter);
            const truncated = dateTruncExpression(granularity, sql`${pullRequests.closedAt}`);

            if (groupExprs) {
                const rows = await tx.execute(
                    sql`SELECT ${groupExprs.select}, ${truncated} as period, count(*) FILTER (WHERE ${pullRequests.merged} = true) * 100.0 / NULLIF(count(*), 0) as value FROM ${pullRequests} INNER JOIN ${repositories} ON ${repositories.id} = ${pullRequests.repositoryId} AND ${repositories.integrationId} = ${pullRequests.integrationId} ${groupExprs.join} WHERE ${and(...conditions)} GROUP BY group_key, group_label, period ORDER BY group_label, period`,
                );
                const series = groupRowsIntoSeries(parseGroupedRows(rows.rows ?? []));
                return {metric: 'PR Merge Rate', unit: '%', data: [], series};
            }

            const rows = await tx.execute(
                sql`SELECT ${truncated} as period, count(*) FILTER (WHERE ${pullRequests.merged} = true) * 100.0 / NULLIF(count(*), 0) as value FROM ${pullRequests} WHERE ${and(...conditions)} GROUP BY period ORDER BY period`,
            );
            const data = (rows.rows ?? []).map((r: any) => ({
                period: new Date(r.period).toISOString(),
                value: Math.round((Number(r.value) || 0) * 100) / 100,
            }));
            return {metric: 'PR Merge Rate', unit: '%', data};
        },
    });
}

export async function getActivityVolume({integrationIds, filter}: MetricsParams): Promise<MetricResult> {
    const granularity = filter.granularity ?? 'week';
    const {from, to} = getDateRange(filter);

    return withRlsTransaction({
        integrationIds,
        callback: async (tx) => {
            const repoIds = getEffectiveRepositoryIds(filter);
            const {wrRepoFilter, prRepoFilter, wrBranchFilter, prBranchFilter, wrUserFilter, prUserFilter} = buildUnionFilters(filter, repoIds);

            const groupExprs = getGroupByExpressions(filter);

            if (groupExprs) {
                const rows = await tx.execute(sql`
                    SELECT group_key, group_label, period, sum(cnt) as value FROM (
                        SELECT ${groupExprs.select},
                               ${dateTruncExpression(granularity, sql`${workflowRuns.createdAt}`)} as period, count(*) as cnt
                        FROM ${workflowRuns}
                        INNER JOIN ${repositories} ON ${repositories.id} = ${workflowRuns.repositoryId} AND ${repositories.integrationId} = ${workflowRuns.integrationId}
                        ${groupExprs.join}
                        WHERE ${workflowRuns.createdAt} >= ${from.toISOString()}::timestamptz
                          AND ${workflowRuns.createdAt} <= ${to.toISOString()}::timestamptz
                          ${wrRepoFilter} ${wrBranchFilter} ${wrUserFilter}
                        GROUP BY group_key, group_label, period
                        UNION ALL
                        SELECT ${groupExprs.select},
                               ${dateTruncExpression(granularity, sql`${pullRequests.createdAt}`)} as period, count(*) as cnt
                        FROM ${pullRequests}
                        INNER JOIN ${repositories} ON ${repositories.id} = ${pullRequests.repositoryId} AND ${repositories.integrationId} = ${pullRequests.integrationId}
                        ${groupExprs.join}
                        WHERE ${pullRequests.createdAt} >= ${from.toISOString()}::timestamptz
                          AND ${pullRequests.createdAt} <= ${to.toISOString()}::timestamptz
                          ${prRepoFilter} ${prBranchFilter} ${prUserFilter}
                        GROUP BY group_key, group_label, period
                    ) combined
                    GROUP BY group_key, group_label, period
                    ORDER BY group_label, period
                `);
                const series = groupRowsIntoSeries(parseGroupedRows(rows.rows ?? []));
                return {metric: 'Activity Volume', unit: 'events', data: [], series};
            }

            const rows = await tx.execute(sql`
                SELECT period, sum(cnt) as value FROM (
                    SELECT ${dateTruncExpression(granularity, sql`${workflowRuns.createdAt}`)} as period, count(*) as cnt
                    FROM ${workflowRuns}
                    WHERE ${workflowRuns.createdAt} >= ${from.toISOString()}::timestamptz
                      AND ${workflowRuns.createdAt} <= ${to.toISOString()}::timestamptz
                      ${wrRepoFilter} ${wrBranchFilter} ${wrUserFilter}
                    GROUP BY period
                    UNION ALL
                    SELECT ${dateTruncExpression(granularity, sql`${pullRequests.createdAt}`)} as period, count(*) as cnt
                    FROM ${pullRequests}
                    WHERE ${pullRequests.createdAt} >= ${from.toISOString()}::timestamptz
                      AND ${pullRequests.createdAt} <= ${to.toISOString()}::timestamptz
                      ${prRepoFilter} ${prBranchFilter} ${prUserFilter}
                    GROUP BY period
                ) combined
                GROUP BY period
                ORDER BY period
            `);
            const data = (rows.rows ?? []).map((r: any) => ({
                period: new Date(r.period).toISOString(),
                value: Number(r.value) || 0,
            }));
            return {metric: 'Activity Volume', unit: 'events', data};
        },
    });
}

export async function getContributorCount({integrationIds, filter}: MetricsParams): Promise<MetricResult> {
    const granularity = filter.granularity ?? 'week';
    const {from, to} = getDateRange(filter);

    return withRlsTransaction({
        integrationIds,
        callback: async (tx) => {
            const repoIds = getEffectiveRepositoryIds(filter);
            const {wrRepoFilter, prRepoFilter, wrBranchFilter, prBranchFilter, wrUserFilter, prUserFilter} = buildUnionFilters(filter, repoIds);

            const groupExprs = getGroupByExpressions(filter);

            if (groupExprs) {
                const rows = await tx.execute(sql`
                    SELECT group_key, group_label, period, count(DISTINCT actor) as value FROM (
                        SELECT ${groupExprs.select},
                               ${dateTruncExpression(granularity, sql`${workflowRuns.createdAt}`)} as period, ${workflowRuns.actorId} as actor
                        FROM ${workflowRuns}
                        INNER JOIN ${repositories} ON ${repositories.id} = ${workflowRuns.repositoryId} AND ${repositories.integrationId} = ${workflowRuns.integrationId}
                        ${groupExprs.join}
                        WHERE ${workflowRuns.createdAt} >= ${from.toISOString()}::timestamptz
                          AND ${workflowRuns.createdAt} <= ${to.toISOString()}::timestamptz
                          ${wrRepoFilter} ${wrBranchFilter} ${wrUserFilter}
                        UNION ALL
                        SELECT ${groupExprs.select},
                               ${dateTruncExpression(granularity, sql`${pullRequests.createdAt}`)} as period, ${pullRequests.authorId} as actor
                        FROM ${pullRequests}
                        INNER JOIN ${repositories} ON ${repositories.id} = ${pullRequests.repositoryId} AND ${repositories.integrationId} = ${pullRequests.integrationId}
                        ${groupExprs.join}
                        WHERE ${pullRequests.createdAt} >= ${from.toISOString()}::timestamptz
                          AND ${pullRequests.createdAt} <= ${to.toISOString()}::timestamptz
                          ${prRepoFilter} ${prBranchFilter} ${prUserFilter}
                    ) combined
                    GROUP BY group_key, group_label, period
                    ORDER BY group_label, period
                `);
                const series = groupRowsIntoSeries(parseGroupedRows(rows.rows ?? []));
                return {metric: 'Contributor Count', unit: 'contributors', data: [], series};
            }

            const rows = await tx.execute(sql`
                SELECT period, count(DISTINCT actor) as value FROM (
                    SELECT ${dateTruncExpression(granularity, sql`${workflowRuns.createdAt}`)} as period, ${workflowRuns.actorId} as actor
                    FROM ${workflowRuns}
                    WHERE ${workflowRuns.createdAt} >= ${from.toISOString()}::timestamptz
                      AND ${workflowRuns.createdAt} <= ${to.toISOString()}::timestamptz
                      ${wrRepoFilter} ${wrBranchFilter} ${wrUserFilter}
                    UNION ALL
                    SELECT ${dateTruncExpression(granularity, sql`${pullRequests.createdAt}`)} as period, ${pullRequests.authorId} as actor
                    FROM ${pullRequests}
                    WHERE ${pullRequests.createdAt} >= ${from.toISOString()}::timestamptz
                      AND ${pullRequests.createdAt} <= ${to.toISOString()}::timestamptz
                      ${prRepoFilter} ${prBranchFilter} ${prUserFilter}
                ) combined
                GROUP BY period
                ORDER BY period
            `);
            const data = (rows.rows ?? []).map((r: any) => ({
                period: new Date(r.period).toISOString(),
                value: Number(r.value) || 0,
            }));
            return {metric: 'Contributor Count', unit: 'contributors', data};
        },
    });
}

export async function getCIDuration({integrationIds, filter}: MetricsParams): Promise<MetricResult> {
    const granularity = filter.granularity ?? 'week';
    const {from, to} = getDateRange(filter);

    return withRlsTransaction({
        integrationIds,
        callback: async (tx) => {
            const conditions = buildWorkflowJobConditions(filter, from, to);
            const groupExprs = getGroupByExpressions(filter);
            const truncated = dateTruncExpression(granularity, sql`${workflowJobs.createdAt}`);

            if (groupExprs) {
                const rows = await tx.execute(
                    sql`SELECT ${groupExprs.select}, ${truncated} as period, avg(extract(epoch from (${workflowJobs.completedAt} - ${workflowJobs.startedAt})) / 60) as value FROM ${workflowJobs} INNER JOIN ${repositories} ON ${repositories.id} = ${workflowJobs.repositoryId} AND ${repositories.integrationId} = ${workflowJobs.integrationId} ${groupExprs.join} WHERE ${and(...conditions)} GROUP BY group_key, group_label, period ORDER BY group_label, period`,
                );
                const series = groupRowsIntoSeries(parseGroupedRows(rows.rows ?? []));
                return {metric: 'CI Duration', unit: 'minutes', data: [], series};
            }

            const rows = await tx.execute(
                sql`SELECT ${truncated} as period, avg(extract(epoch from (${workflowJobs.completedAt} - ${workflowJobs.startedAt})) / 60) as value FROM ${workflowJobs} WHERE ${and(...conditions)} GROUP BY period ORDER BY period`,
            );
            const data = (rows.rows ?? []).map((r: any) => ({
                period: new Date(r.period).toISOString(),
                value: Math.round((Number(r.value) || 0) * 100) / 100,
            }));
            return {metric: 'CI Duration', unit: 'minutes', data};
        },
    });
}

export async function getPRCycleTime({integrationIds, filter}: MetricsParams): Promise<MetricResult> {
    const granularity = filter.granularity ?? 'week';
    const {from, to} = getDateRange(filter);

    return withRlsTransaction({
        integrationIds,
        callback: async (tx) => {
            const conditions: SQL[] = [gte(pullRequests.mergedAt, from), lte(pullRequests.mergedAt, to)];
            conditions.push(eq(pullRequests.merged, true));
            buildPullRequestFilters(conditions, filter);
            const groupExprs = getGroupByExpressions(filter);
            const truncated = dateTruncExpression(granularity, sql`${pullRequests.mergedAt}`);

            if (groupExprs) {
                const rows = await tx.execute(
                    sql`SELECT ${groupExprs.select}, ${truncated} as period, percentile_cont(0.5) within group (order by extract(epoch from (${pullRequests.mergedAt} - ${pullRequests.createdAt})) / 3600) as value FROM ${pullRequests} INNER JOIN ${repositories} ON ${repositories.id} = ${pullRequests.repositoryId} AND ${repositories.integrationId} = ${pullRequests.integrationId} ${groupExprs.join} WHERE ${and(...conditions)} GROUP BY group_key, group_label, period ORDER BY group_label, period`,
                );
                const series = groupRowsIntoSeries(parseGroupedRows(rows.rows ?? []));
                return {metric: 'PR Cycle Time', unit: 'hours', data: [], series};
            }

            const rows = await tx.execute(
                sql`SELECT ${truncated} as period, percentile_cont(0.5) within group (order by extract(epoch from (${pullRequests.mergedAt} - ${pullRequests.createdAt})) / 3600) as value FROM ${pullRequests} WHERE ${and(...conditions)} GROUP BY period ORDER BY period`,
            );
            const data = (rows.rows ?? []).map((r: any) => ({
                period: new Date(r.period).toISOString(),
                value: Math.round((Number(r.value) || 0) * 100) / 100,
            }));
            return {metric: 'PR Cycle Time', unit: 'hours', data};
        },
    });
}

export async function getPRSize({integrationIds, filter}: MetricsParams): Promise<MetricResult> {
    const granularity = filter.granularity ?? 'week';
    const {from, to} = getDateRange(filter);

    return withRlsTransaction({
        integrationIds,
        callback: async (tx) => {
            const conditions: SQL[] = [gte(pullRequests.createdAt, from), lte(pullRequests.createdAt, to)];
            buildPullRequestFilters(conditions, filter);
            const groupExprs = getGroupByExpressions(filter);
            const truncated = dateTruncExpression(granularity, sql`${pullRequests.createdAt}`);

            if (groupExprs) {
                const rows = await tx.execute(
                    sql`SELECT ${groupExprs.select}, ${truncated} as period, avg(${pullRequests.additions} + ${pullRequests.deletions}) as value
                    FROM ${pullRequests}
                    INNER JOIN ${repositories} ON ${repositories.id} = ${pullRequests.repositoryId} AND ${repositories.integrationId} = ${pullRequests.integrationId}
                    ${groupExprs.join}
                    WHERE ${and(...conditions)}
                    GROUP BY group_key, group_label, period
                    ORDER BY group_label, period`,
                );
                const series = groupRowsIntoSeries(parseGroupedRows(rows.rows ?? []));
                return {metric: 'PR Size', unit: 'lines', data: [], series};
            }

            const rows = await tx.execute(
                sql`SELECT ${truncated} as period, avg(${pullRequests.additions} + ${pullRequests.deletions}) as value
                FROM ${pullRequests}
                WHERE ${and(...conditions)}
                GROUP BY period
                ORDER BY period`,
            );
            const data = (rows.rows ?? []).map((r: any) => ({
                period: new Date(r.period).toISOString(),
                value: Math.round((Number(r.value) || 0) * 100) / 100,
            }));
            return {metric: 'PR Size', unit: 'lines', data};
        },
    });
}

export async function getPRReviewTime({integrationIds, filter}: MetricsParams): Promise<MetricResult> {
    const granularity = filter.granularity ?? 'week';
    const {from, to} = getDateRange(filter);

    return withRlsTransaction({
        integrationIds,
        callback: async (tx) => {
            const repoFilter = getEffectiveRepositoryIds(filter);
            const reviewCte = sql`
                WITH first_reviews AS (
                    SELECT r.pull_request_id, r.repository_id, r.integration_id, MIN(r.submitted_at) as first_review_at
                    FROM ${pullRequestReviews} r
                    WHERE r.state IN ('approved', 'changes_requested')
                      AND r.submitted_at >= ${from.toISOString()}::timestamptz
                      AND r.submitted_at <= ${to.toISOString()}::timestamptz
                      ${repoFilter ? sql`AND r.repository_id = ANY(${sql.raw(`ARRAY[${repoFilter.join(',')}]`)})` : sql``}
                      ${
                          filter.topics?.length
                              ? sql`AND r.repository_id IN (SELECT id FROM github.repositories WHERE integration_id = r.integration_id AND topics ?| array[${sql.join(
                                    filter.topics.map((t) => sql`${t}`),
                                    sql`, `,
                                )}])`
                              : sql``
                      }
                    GROUP BY r.pull_request_id, r.repository_id, r.integration_id
                )`;
            const userCond = filter.usersOnly ? sql`AND pr.author_id NOT IN (SELECT id FROM github."user" WHERE type = 'Bot')` : sql``;
            const branchCond = filter.defaultBranchOnly
                ? sql`AND pr.base_branch = (SELECT default_branch FROM github.repositories r2 WHERE r2.id = pr.repository_id AND r2.integration_id = pr.integration_id)`
                : sql``;

            if (filter.groupBy === 'repository' || filter.groupBy === 'topic') {
                const isTopicGroup = filter.groupBy === 'topic';
                const rows = await tx.execute(sql`
                    ${reviewCte}
                    SELECT
                        ${isTopicGroup ? sql`t.topic as group_key, t.topic as group_label` : sql`repo.id::text as group_key, repo.name as group_label`},
                        ${dateTruncExpression(granularity, sql`fr.first_review_at`)} as period,
                        avg(extract(epoch from (fr.first_review_at - pr.created_at)) / 3600) as value
                    FROM first_reviews fr
                    JOIN ${pullRequests} pr ON pr.integration_id = fr.integration_id AND pr.id = fr.pull_request_id
                    JOIN ${repositories} repo ON repo.integration_id = fr.integration_id AND repo.id = fr.repository_id
                    ${isTopicGroup ? sql.raw(`CROSS JOIN LATERAL jsonb_array_elements_text(repo.topics) AS t(topic)`) : sql``}
                    WHERE TRUE ${userCond} ${branchCond}
                    GROUP BY group_key, group_label, period
                    ORDER BY group_label, period
                `);
                const series = groupRowsIntoSeries(parseGroupedRows(rows.rows ?? []));
                return {metric: 'PR Review Time', unit: 'hours', data: [], series};
            }

            const rows = await tx.execute(sql`
                ${reviewCte}
                SELECT
                    ${dateTruncExpression(granularity, sql`fr.first_review_at`)} as period,
                    avg(extract(epoch from (fr.first_review_at - pr.created_at)) / 3600) as value
                FROM first_reviews fr
                JOIN ${pullRequests} pr ON pr.integration_id = fr.integration_id AND pr.id = fr.pull_request_id
                WHERE TRUE ${userCond} ${branchCond}
                GROUP BY period
                ORDER BY period
            `);
            const data = (rows.rows ?? []).map((r: any) => ({
                period: new Date(r.period).toISOString(),
                value: Math.round((Number(r.value) || 0) * 100) / 100,
            }));
            return {metric: 'PR Review Time', unit: 'hours', data};
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

export async function listTopics({integrationIds}: {integrationIds: string[]}) {
    return withRlsTransaction({
        integrationIds,
        callback: async (tx) => {
            const rows = await tx.execute(
                sql`SELECT DISTINCT jsonb_array_elements_text(${repositories.topics}) AS topic FROM ${repositories} ORDER BY topic`,
            );
            return (rows.rows ?? []).map((r: any) => String(r.topic));
        },
    });
}
