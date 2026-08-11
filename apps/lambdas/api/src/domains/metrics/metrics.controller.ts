import {
    getActivityVolume,
    getChangeFailureRate,
    getCIDuration,
    getContributorCount,
    getDeploymentFrequency,
    getLeadTimeForChanges,
    getMeanTimeToRecovery,
    getPRCycleTime,
    getPRMergeRate,
    getPRReviewTime,
    getPRSize,
} from '@gitgazer/db/queries/metrics';
import type {MetricResult, MetricsFilter} from '@gitgazer/db/types/metrics';

type MetricsControllerParams = {
    integrationIds: string[];
    filter: MetricsFilter;
};

const metricQueryMap = {
    deployment_frequency: getDeploymentFrequency,
    lead_time: getLeadTimeForChanges,
    change_failure_rate: getChangeFailureRate,
    mttr: getMeanTimeToRecovery,
    pr_merge_rate: getPRMergeRate,
    activity_volume: getActivityVolume,
    contributor_count: getContributorCount,
    ci_duration: getCIDuration,
    pr_cycle_time: getPRCycleTime,
    pr_size: getPRSize,
    pr_review_time: getPRReviewTime,
} as const satisfies Record<string, (params: MetricsControllerParams) => Promise<MetricResult>>;

export type MetricName = keyof typeof metricQueryMap;
export const VALID_METRIC_NAMES = new Set<string>(Object.keys(metricQueryMap));

export const getWidgetMetric = async ({
    integrationIds,
    filter,
    metricName,
}: MetricsControllerParams & {metricName: MetricName}): Promise<MetricResult> => {
    return metricQueryMap[metricName]({integrationIds, filter});
};
