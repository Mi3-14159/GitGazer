<script setup lang="ts">
    import DashboardList from '@/components/analytics/DashboardList.vue';
    import WidgetGrid from '@/components/analytics/WidgetGrid.vue';
    import DateTimeRangePicker, {type DateRange} from '@/components/DateTimeRangePicker.vue';
    import PageHeader from '@/components/PageHeader.vue';
    import Button from '@/components/ui/Button.vue';
    import {type Dashboard, defaultDashboards} from '@/types/analytics';
    import type {MetricsFilter} from '@common/types';
    import {ArrowLeft} from 'lucide-vue-next';
    import {computed, ref, watch} from 'vue';
    import {useRoute, useRouter} from 'vue-router';

    const route = useRoute();
    const router = useRouter();

    const selectedDashboardId = ref<string | null>((route.params.dashboardId as string) || null);
    const dateRange = ref<DateRange>({});
    const dashboards = ref<Dashboard[]>([...defaultDashboards]);

    const currentDashboard = computed(() =>
        selectedDashboardId.value ? (dashboards.value.find((d) => d.id === selectedDashboardId.value) ?? null) : null,
    );

    const metricsFilter = computed<MetricsFilter>(() => {
        const filter: MetricsFilter = {};
        if (dateRange.value.from) filter.from = dateRange.value.from.toISOString();
        if (dateRange.value.to) filter.to = dateRange.value.to.toISOString();
        return filter;
    });

    // Sync route param changes to local state (e.g. browser back/forward)
    watch(
        () => route.params.dashboardId as string | undefined,
        (id) => {
            selectedDashboardId.value = id || null;
        },
    );

    function onSelectDashboard(id: string) {
        router.push({name: 'dashboards', params: {dashboardId: id}, query: route.query});
    }

    function onBackToList() {
        router.push({name: 'dashboards', params: {dashboardId: undefined}, query: route.query});
    }
</script>

<template>
    <div class="space-y-4 p-4">
        <!-- Dashboard Detail View -->
        <template v-if="currentDashboard">
            <PageHeader>
                <template #left>
                    <Button
                        variant="ghost"
                        class="gap-2"
                        @click="onBackToList"
                    >
                        <ArrowLeft class="h-4 w-4" />
                        Back to Dashboards
                    </Button>
                </template>
                <DateTimeRangePicker v-model:date-range="dateRange" />
            </PageHeader>

            <WidgetGrid
                :dashboard="currentDashboard"
                :filter="metricsFilter"
            />
        </template>

        <!-- Dashboard List View -->
        <template v-else>
            <PageHeader description="View built-in DORA &amp; SPACE dashboards">
                <DateTimeRangePicker v-model:date-range="dateRange" />
            </PageHeader>

            <DashboardList
                :dashboards="dashboards"
                @select="onSelectDashboard"
            />
        </template>
    </div>
</template>
