import {useAuth} from '@/composables/useAuth';
import type {WidgetType} from '@/types/analytics';
import type {DoraMetricsResponse, MetricsFilter, SpaceMetricsResponse} from '@common/types';

const API_ENDPOINT = import.meta.env.VITE_REST_API_ENDPOINT;

/** Maps each widget type to a field in a DoraMetricsResponse or SpaceMetricsResponse. */
export const metricFieldMap: Record<WidgetType, {endpoint: 'dora' | 'space'; field: string}> = {
    deployment_frequency: {endpoint: 'dora', field: 'deploymentFrequency'},
    lead_time: {endpoint: 'dora', field: 'leadTimeForChanges'},
    mttr: {endpoint: 'dora', field: 'meanTimeToRecovery'},
    change_failure_rate: {endpoint: 'dora', field: 'changeFailureRate'},
    pr_merge_rate: {endpoint: 'space', field: 'prMergeRate'},
    activity_volume: {endpoint: 'space', field: 'activityVolume'},
    ci_duration: {endpoint: 'space', field: 'ciDuration'},
    pr_cycle_time: {endpoint: 'space', field: 'prCycleTime'},
    workflow_queue_time: {endpoint: 'space', field: 'workflowQueueTime'},
    contributor_count: {endpoint: 'space', field: 'contributorCount'},
};

function buildQueryString(filter: MetricsFilter): string {
    const params = new URLSearchParams();
    if (filter.repositoryId) params.set('repositoryId', String(filter.repositoryId));
    if (filter.from) params.set('from', filter.from);
    if (filter.to) params.set('to', filter.to);
    if (filter.branch) params.set('branch', filter.branch);
    if (filter.granularity) params.set('granularity', filter.granularity);
    return params.toString();
}

export function useMetrics() {
    const {fetchWithAuth} = useAuth();

    async function fetchDoraMetrics(filter: MetricsFilter): Promise<DoraMetricsResponse> {
        const qs = buildQueryString(filter);
        const res = await fetchWithAuth(`${API_ENDPOINT}/metrics/dora${qs ? `?${qs}` : ''}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as DoraMetricsResponse;
    }

    async function fetchSpaceMetrics(filter: MetricsFilter): Promise<SpaceMetricsResponse> {
        const qs = buildQueryString(filter);
        const res = await fetchWithAuth(`${API_ENDPOINT}/metrics/space${qs ? `?${qs}` : ''}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as SpaceMetricsResponse;
    }

    return {fetchDoraMetrics, fetchSpaceMetrics};
}
