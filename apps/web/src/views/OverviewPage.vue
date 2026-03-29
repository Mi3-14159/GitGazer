<script setup lang="ts">
    import RecentWorkflowRuns from '@/components/dashboard/RecentWorkflowRuns.vue';
    import StatCards from '@/components/dashboard/StatCards.vue';
    import StatusDistributionChart from '@/components/dashboard/StatusDistributionChart.vue';
    import DateTimeRangePicker from '@/components/filters/DateTimeRangePicker.vue';
    import PageHeader from '@/components/PageHeader.vue';
    import {useAuth} from '@/composables/useAuth';
    import {dateRangeFilter, useUrlFilters} from '@/composables/useUrlFilters';
    import type {OverviewResponse} from '@common/types';
    import {computed, onBeforeUnmount, ref, watch} from 'vue';

    const API_ENDPOINT = import.meta.env.VITE_REST_API_ENDPOINT;

    const {fetchWithAuth} = useAuth();
    const overview = ref<OverviewResponse | null>(null);
    const isLoading = ref(true);
    let abortController: AbortController | null = null;
    const {dateRange} = useUrlFilters({
        dateRange: dateRangeFilter({window: '24h'}),
    });

    async function fetchOverview() {
        abortController?.abort();
        const controller = new AbortController();
        abortController = controller;

        isLoading.value = true;
        try {
            const params = new URLSearchParams();
            if (dateRange.value.window) {
                params.set('window', dateRange.value.window);
            } else {
                if (dateRange.value.from) params.set('created_from', dateRange.value.from.toISOString());
                if (dateRange.value.to) params.set('created_to', dateRange.value.to.toISOString());
            }
            const response = await fetchWithAuth(`${API_ENDPOINT}/overview?${params.toString()}`, {signal: controller.signal});
            if (response.ok) {
                overview.value = (await response.json()) as OverviewResponse;
            }
        } catch (e) {
            if (e instanceof DOMException && e.name === 'AbortError') return;
        } finally {
            if (!controller.signal.aborted) {
                isLoading.value = false;
            }
        }
    }

    onBeforeUnmount(() => abortController?.abort());

    watch(dateRange, () => fetchOverview(), {deep: true, immediate: true});

    const stats = computed(() => overview.value?.stats ?? {total: 0, success: 0, failure: 0, inProgress: 0, other: 0});
    const successRate = computed(() => (stats.value.total > 0 ? ((stats.value.success / stats.value.total) * 100).toFixed(1) : '0.0'));
    const recentWorkflows = computed(() => overview.value?.recentWorkflows ?? []);
</script>

<template>
    <div class="space-y-4 p-4">
        <PageHeader description="Real-time CI/CD pipeline monitoring and engineering metrics">
            <DateTimeRangePicker v-model:date-range="dateRange" />
        </PageHeader>

        <div data-tour="stat-cards">
            <StatCards
                :stats="stats"
                :success-rate="successRate"
            />
        </div>

        <StatusDistributionChart :stats="stats" />

        <RecentWorkflowRuns
            :workflows="recentWorkflows"
            :is-loading="isLoading"
        />
    </div>
</template>
