export const GRANULARITY_VALUES = ['hour', 'day', 'week', 'month'] as const;
export type Granularity = (typeof GRANULARITY_VALUES)[number];

export const GROUP_BY_OPTIONS = ['none', 'repository', 'topic'] as const;
export type GroupByOption = (typeof GROUP_BY_OPTIONS)[number];

export type MetricsFilter = {
    repositoryId?: number;
    repositoryIds?: number[];
    topics?: string[];
    from?: string;
    to?: string;
    defaultBranchOnly?: boolean;
    usersOnly?: boolean;
    granularity?: Granularity;
    groupBy?: GroupByOption;
};

export const isMetricsFilter = (params: Record<string, unknown>): params is MetricsFilter & Record<string, unknown> => {
    if (params.repositoryId !== undefined && isNaN(Number(params.repositoryId))) return false;
    if (params.granularity !== undefined && !['hour', 'day', 'week', 'month'].includes(String(params.granularity))) return false;
    if (params.usersOnly !== undefined && !['true', 'false'].includes(String(params.usersOnly))) return false;
    if (params.groupBy !== undefined && !['none', 'repository', 'topic'].includes(String(params.groupBy))) return false;
    return true;
};

export type MetricDataPoint = {
    period: string;
    value: number;
};

export type MetricSeries = {
    groupKey: string;
    groupLabel: string;
    data: MetricDataPoint[];
};

export type MetricResult = {
    metric: string;
    unit: string;
    data: MetricDataPoint[];
    series?: MetricSeries[];
};

export type DoraMetricsResponse = {
    deploymentFrequency: MetricResult;
    leadTimeForChanges: MetricResult;
    changeFailureRate: MetricResult;
    meanTimeToRecovery: MetricResult;
};

export type SpaceMetricsResponse = {
    prMergeRate: MetricResult;
    activityVolume: MetricResult;
    ciDuration: MetricResult;
    prCycleTime: MetricResult;
    workflowQueueTime: MetricResult;
    contributorCount: MetricResult;
    prSize: MetricResult;
    prReviewTime: MetricResult;
};

function isMetricResult(value: unknown): value is MetricResult {
    if (typeof value !== 'object' || value === null) return false;
    const v = value as Record<string, unknown>;
    return typeof v.metric === 'string' && typeof v.unit === 'string' && Array.isArray(v.data);
}

export const isDoraMetricsResponse = (value: unknown): value is DoraMetricsResponse => {
    if (typeof value !== 'object' || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
        isMetricResult(v.deploymentFrequency) &&
        isMetricResult(v.leadTimeForChanges) &&
        isMetricResult(v.changeFailureRate) &&
        isMetricResult(v.meanTimeToRecovery)
    );
};

export const isSpaceMetricsResponse = (value: unknown): value is SpaceMetricsResponse => {
    if (typeof value !== 'object' || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
        isMetricResult(v.prMergeRate) &&
        isMetricResult(v.activityVolume) &&
        isMetricResult(v.ciDuration) &&
        isMetricResult(v.prCycleTime) &&
        isMetricResult(v.workflowQueueTime) &&
        isMetricResult(v.contributorCount) &&
        isMetricResult(v.prSize) &&
        isMetricResult(v.prReviewTime)
    );
};

// Custom query types

export type ChartType = 'line' | 'bar' | 'stacked-bar' | 'area' | 'gauge' | 'multi-line' | 'table';

export type CustomQueryColumn = {
    name: string;
    type: string;
};

export type CustomQueryResponse = {
    columns: CustomQueryColumn[];
    rows: Record<string, unknown>[];
    rowCount: number;
};

export type TableSchema = {
    schema: string;
    table: string;
    columns: CustomQueryColumn[];
};

export type WidgetColumnConfig = {
    xAxis?: string;
    yAxis?: string;
    seriesColumn?: string;
    valueColumn?: string;
};

export type CustomWidget = {
    id: string;
    title: string;
    query: string;
    chartType: ChartType;
    position: {x: number; y: number; w: number; h: number};
    config: WidgetColumnConfig;
};
