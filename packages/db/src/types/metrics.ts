export type Granularity = 'day' | 'week' | 'month';

export type MetricsFilter = {
    repositoryId?: number;
    from?: string;
    to?: string;
    branch?: string;
    granularity?: Granularity;
};

export const isMetricsFilter = (params: Record<string, unknown>): params is MetricsFilter & Record<string, unknown> => {
    if (params.repositoryId !== undefined && isNaN(Number(params.repositoryId))) return false;
    if (params.granularity !== undefined && !['day', 'week', 'month'].includes(String(params.granularity))) return false;
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
