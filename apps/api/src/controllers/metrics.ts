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
    getWorkflowQueueTime,
} from '@gitgazer/db/queries/metrics';
import type {DoraMetricsResponse, MetricsFilter, SpaceMetricsResponse} from '@gitgazer/db/types/metrics';

type MetricsControllerParams = {
    integrationIds: string[];
    filter: MetricsFilter;
};

export const getDoraMetrics = async ({integrationIds, filter}: MetricsControllerParams): Promise<DoraMetricsResponse> => {
    const [deploymentFrequency, leadTimeForChanges, changeFailureRate, meanTimeToRecovery] = await Promise.all([
        getDeploymentFrequency({integrationIds, filter}),
        getLeadTimeForChanges({integrationIds, filter}),
        getChangeFailureRate({integrationIds, filter}),
        getMeanTimeToRecovery({integrationIds, filter}),
    ]);

    return {deploymentFrequency, leadTimeForChanges, changeFailureRate, meanTimeToRecovery};
};

export const getSpaceMetrics = async ({integrationIds, filter}: MetricsControllerParams): Promise<SpaceMetricsResponse> => {
    const [prMergeRate, activityVolume, contributorCount, ciDuration, prCycleTime, workflowQueueTime] = await Promise.all([
        getPRMergeRate({integrationIds, filter}),
        getActivityVolume({integrationIds, filter}),
        getContributorCount({integrationIds, filter}),
        getCIDuration({integrationIds, filter}),
        getPRCycleTime({integrationIds, filter}),
        getWorkflowQueueTime({integrationIds, filter}),
    ]);

    return {prMergeRate, activityVolume, contributorCount, ciDuration, prCycleTime, workflowQueueTime};
};
