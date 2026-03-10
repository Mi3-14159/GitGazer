import {useAuth} from '@/composables/useAuth';
import type {DoraMetricsResponse, MetricsFilter, SpaceMetricsResponse} from '@common/types/metrics';
import {ref} from 'vue';

const API_ENDPOINT = import.meta.env.VITE_REST_API_ENDPOINT;

export const useMetrics = () => {
    const {fetchWithAuth} = useAuth();
    const isLoadingDora = ref(false);
    const isLoadingSpace = ref(false);
    const doraMetrics = ref<DoraMetricsResponse | null>(null);
    const spaceMetrics = ref<SpaceMetricsResponse | null>(null);
    const error = ref<string | null>(null);

    function buildQueryString(integrationId: string, filter: MetricsFilter): string {
        const params = new URLSearchParams();
        params.set('integrationId', integrationId);
        if (filter.repositoryId) params.set('repositoryId', String(filter.repositoryId));
        if (filter.from) params.set('from', filter.from);
        if (filter.to) params.set('to', filter.to);
        if (filter.branch) params.set('branch', filter.branch);
        if (filter.granularity) params.set('granularity', filter.granularity);
        return `?${params.toString()}`;
    }

    const fetchDoraMetrics = async (integrationId: string, filter: MetricsFilter = {}): Promise<DoraMetricsResponse | null> => {
        isLoadingDora.value = true;
        error.value = null;
        try {
            const response = await fetchWithAuth(`${API_ENDPOINT}/metrics/dora${buildQueryString(integrationId, filter)}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch DORA metrics: ${response.status}`);
            }
            doraMetrics.value = (await response.json()) as DoraMetricsResponse;
            return doraMetrics.value;
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Unknown error';
            return null;
        } finally {
            isLoadingDora.value = false;
        }
    };

    const fetchSpaceMetrics = async (integrationId: string, filter: MetricsFilter = {}): Promise<SpaceMetricsResponse | null> => {
        isLoadingSpace.value = true;
        error.value = null;
        try {
            const response = await fetchWithAuth(`${API_ENDPOINT}/metrics/space${buildQueryString(integrationId, filter)}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch SPACE metrics: ${response.status}`);
            }
            spaceMetrics.value = (await response.json()) as SpaceMetricsResponse;
            return spaceMetrics.value;
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Unknown error';
            return null;
        } finally {
            isLoadingSpace.value = false;
        }
    };

    const fetchRepositories = async (integrationId: string): Promise<{id: number; name: string}[]> => {
        try {
            const response = await fetchWithAuth(`${API_ENDPOINT}/metrics/repositories?integrationId=${encodeURIComponent(integrationId)}`);
            if (!response.ok) return [];
            return (await response.json()) as {id: number; name: string}[];
        } catch {
            return [];
        }
    };

    return {
        doraMetrics,
        spaceMetrics,
        isLoadingDora,
        isLoadingSpace,
        error,
        fetchDoraMetrics,
        fetchSpaceMetrics,
        fetchRepositories,
    };
};
