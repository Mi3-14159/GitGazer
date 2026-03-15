<script setup lang="ts">
    import DateTimeRangePicker, {type DateRange} from '@/components/DateTimeRangePicker.vue';
    import RecentWorkflowRuns from '@/components/dashboard/RecentWorkflowRuns.vue';
    import StatCards from '@/components/dashboard/StatCards.vue';
    import StatusDistributionChart from '@/components/dashboard/StatusDistributionChart.vue';
    import {useAuth} from '@/composables/useAuth';
    import type {OverviewResponse} from '@common/types';
    import {computed, ref, watch} from 'vue';

    const API_ENDPOINT = import.meta.env.VITE_REST_API_ENDPOINT;

    const {fetchWithAuth} = useAuth();
    const overview = ref<OverviewResponse | null>(null);
    const isLoading = ref(true);
    const dateRange = ref<DateRange>({});

    async function fetchOverview() {
        isLoading.value = true;
        try {
            const params = new URLSearchParams();
            if (dateRange.value.window) {
                params.set('window', dateRange.value.window);
            } else {
                if (dateRange.value.from) params.set('created_from', dateRange.value.from.toISOString());
                if (dateRange.value.to) params.set('created_to', dateRange.value.to.toISOString());
            }
            const response = await fetchWithAuth(`${API_ENDPOINT}/overview?${params.toString()}`);
            if (response.ok) {
                overview.value = (await response.json()) as OverviewResponse;
            }
        } catch {
            // Silently handle errors
        } finally {
            isLoading.value = false;
        }
    }

    watch(dateRange, () => fetchOverview(), {deep: true});

    const stats = computed(() => overview.value?.stats ?? {total: 0, success: 0, failure: 0, inProgress: 0, other: 0});
    const successRate = computed(() => (stats.value.total > 0 ? ((stats.value.success / stats.value.total) * 100).toFixed(1) : '0.0'));
    const recentWorkflows = computed(() => overview.value?.recentWorkflows ?? []);
</script>

<template>
    <div class="space-y-6 p-4 md:p-6">
        <div class="flex items-center justify-between gap-4">
            <p class="text-muted-foreground">Real-time CI/CD pipeline monitoring and engineering metrics</p>
            <DateTimeRangePicker v-model:date-range="dateRange" />
        </div>

        <StatCards
            :stats="stats"
            :success-rate="successRate"
        />

        <StatusDistributionChart :stats="stats" />

        <RecentWorkflowRuns
            :workflows="recentWorkflows"
            :is-loading="isLoading"
        />
    </div>
</template>
