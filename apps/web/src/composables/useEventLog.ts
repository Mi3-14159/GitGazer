import {useAuth} from '@/composables/useAuth';
import {isArrayOf, parseApiResponse} from '@/utils/apiResponse';
import type {EventLogCategory, EventLogEntry, EventLogStats, EventLogType} from '@common/types';
import {isEventLogEntry, isEventLogStats} from '@common/types';
import {computed, ref} from 'vue';

const API_ENDPOINT = import.meta.env.VITE_REST_API_ENDPOINT;

export const useEventLog = () => {
    const {fetchWithAuth} = useAuth();
    const loadingCount = ref(0);
    const isLoading = computed(() => loadingCount.value > 0);

    const getEventLogEntries = async (filters?: {
        type?: EventLogType;
        category?: EventLogCategory;
        read?: boolean;
        search?: string;
        limit?: number;
        offset?: number;
    }) => {
        loadingCount.value++;
        try {
            const params = new URLSearchParams();
            if (filters?.type) params.set('type', filters.type);
            if (filters?.category) params.set('category', filters.category);
            if (filters?.read !== undefined) params.set('read', String(filters.read));
            if (filters?.search) params.set('search', filters.search);
            if (filters?.limit) params.set('limit', String(filters.limit));
            if (filters?.offset) params.set('offset', String(filters.offset));

            const qs = params.toString();
            const url = `${API_ENDPOINT}/event-log${qs ? `?${qs}` : ''}`;
            const response = await fetchWithAuth(url);

            if (!response.ok) {
                throw new Error(`Failed to fetch event log: ${response.status}`);
            }

            return parseApiResponse<EventLogEntry[]>(response, isArrayOf(isEventLogEntry));
        } finally {
            loadingCount.value--;
        }
    };

    const getEventLogStats = async () => {
        loadingCount.value++;
        try {
            const response = await fetchWithAuth(`${API_ENDPOINT}/event-log/stats`);
            if (!response.ok) {
                throw new Error(`Failed to fetch event log stats: ${response.status}`);
            }
            return parseApiResponse<EventLogStats>(response, isEventLogStats);
        } finally {
            loadingCount.value--;
        }
    };

    const toggleRead = async (id: string, read: boolean) => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/event-log/${id}/read`, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({read}),
        });
        if (!response.ok) {
            throw new Error(`Failed to update event log entry: ${response.status}`);
        }
        return parseApiResponse<EventLogEntry>(response, isEventLogEntry);
    };

    const markAllRead = async () => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/event-log/mark-all-read`, {
            method: 'POST',
        });
        if (!response.ok) {
            throw new Error(`Failed to mark all as read: ${response.status}`);
        }
        return parseApiResponse<{updated: number}>(response);
    };

    return {
        getEventLogEntries,
        getEventLogStats,
        toggleRead,
        markAllRead,
        isLoading,
    };
};
