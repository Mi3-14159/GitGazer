export type Granularity = 'hour' | 'day' | 'week' | 'month';

export type MetricsFilter = {
    repositoryId?: number;
    repositoryIds?: number[];
    from?: string;
    to?: string;
    defaultBranchOnly?: boolean;
    usersOnly?: boolean;
    granularity?: Granularity;
};

export const isMetricsFilter = (params: Record<string, unknown>): params is MetricsFilter & Record<string, unknown> => {
    if (params.repositoryId !== undefined && isNaN(Number(params.repositoryId))) return false;
    if (params.granularity !== undefined && !['hour', 'day', 'week', 'month'].includes(String(params.granularity))) return false;
    if (params.usersOnly !== undefined && !['true', 'false'].includes(String(params.usersOnly))) return false;
    return true;
};

export type MetricDataPoint = {
    period: string;
    value: number;
};

export type MetricSummary = {
    current: number;
    previous: number;
    trend: 'up' | 'down' | 'stable';
};

export type MetricResult = {
    metric: string;
    unit: string;
    data: MetricDataPoint[];
    summary: MetricSummary;
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
};

// Custom query types

export type ChartType = 'line' | 'bar' | 'stacked-bar' | 'gauge' | 'multi-line' | 'table';

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
