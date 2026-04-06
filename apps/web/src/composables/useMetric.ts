import {useAuth} from '@/composables/useAuth';
import type {WidgetType} from '@/types/analytics';
import {parseApiResponse} from '@/utils/apiResponse';
import type {MetricResult, MetricsFilter} from '@common/types';
import {isMetricResult} from '@common/types';

const API_ENDPOINT = import.meta.env.VITE_REST_API_ENDPOINT;

// Module-level cache for repositories and topics to avoid duplicate fetches
// when multiple filter components mount on the same page.
let repositoriesCache: {id: number; name: string}[] | null = null;
let repositoriesInflight: Promise<{id: number; name: string}[]> | null = null;
let topicsCache: string[] | null = null;
let topicsInflight: Promise<string[]> | null = null;

function buildQueryString(filter: MetricsFilter): string {
    const params = new URLSearchParams();
    if (filter.repositoryIds?.length) params.set('repositoryIds', filter.repositoryIds.join(','));
    else if (filter.repositoryId) params.set('repositoryId', String(filter.repositoryId));
    if (filter.topics?.length) params.set('topics', filter.topics.join(','));
    if (filter.from) params.set('from', filter.from);
    if (filter.to) params.set('to', filter.to);
    if (filter.defaultBranchOnly) params.set('defaultBranchOnly', 'true');
    if (filter.usersOnly) params.set('usersOnly', 'true');
    if (filter.granularity) params.set('granularity', filter.granularity);
    if (filter.groupBy && filter.groupBy !== 'none') params.set('groupBy', filter.groupBy);
    return params.toString();
}

export function useMetrics() {
    const {fetchWithAuth} = useAuth();

    async function fetchWidgetMetric(widgetType: WidgetType, filter: MetricsFilter, signal?: AbortSignal): Promise<MetricResult> {
        const qs = buildQueryString(filter);
        const sep = qs ? '&' : '';
        const res = await fetchWithAuth(`${API_ENDPOINT}/metrics/widget?metricName=${widgetType}${sep}${qs}`, {signal});
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return parseApiResponse(res, isMetricResult);
    }

    async function fetchRepositories(): Promise<{id: number; name: string}[]> {
        if (repositoriesCache) return repositoriesCache;
        if (repositoriesInflight) return repositoriesInflight;
        repositoriesInflight = fetchWithAuth(`${API_ENDPOINT}/metrics/repositories`)
            .then(async (res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await parseApiResponse<{id: number; name: string}[]>(res);
                repositoriesCache = data;
                return data;
            })
            .finally(() => {
                repositoriesInflight = null;
            });
        return repositoriesInflight;
    }

    async function fetchTopics(): Promise<string[]> {
        if (topicsCache) return topicsCache;
        if (topicsInflight) return topicsInflight;
        topicsInflight = fetchWithAuth(`${API_ENDPOINT}/metrics/topics`)
            .then(async (res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await parseApiResponse<string[]>(res);
                topicsCache = data;
                return data;
            })
            .finally(() => {
                topicsInflight = null;
            });
        return topicsInflight;
    }

    return {fetchWidgetMetric, fetchRepositories, fetchTopics};
}
