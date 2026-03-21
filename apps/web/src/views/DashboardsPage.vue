<script setup lang="ts">
    import DashboardFilters from '@/components/analytics/DashboardFilters.vue';
    import DashboardList from '@/components/analytics/DashboardList.vue';
    import WidgetGrid from '@/components/analytics/WidgetGrid.vue';
    import DateTimeRangePicker from '@/components/DateTimeRangePicker.vue';
    import GranularitySelector from '@/components/GranularitySelector.vue';
    import PageHeader from '@/components/PageHeader.vue';
    import Button from '@/components/ui/Button.vue';
    import {useDashboardFilters} from '@/composables/useDashboardFilters';
    import {type Dashboard, defaultDashboards} from '@/types/analytics';
    import {ArrowLeft} from 'lucide-vue-next';
    import {computed, ref, watch} from 'vue';
    import {useRoute, useRouter} from 'vue-router';

    const route = useRoute();
    const router = useRouter();

    const {dateRange, granularity, repositoryIds, topics, defaultBranchOnly, usersOnly, groupBy, metricsFilter} = useDashboardFilters();

    const selectedDashboardId = ref<string | null>((route.params.dashboardId as string) || null);
    const dashboards = ref<Dashboard[]>([...defaultDashboards]);

    const currentDashboard = computed(() =>
        selectedDashboardId.value ? (dashboards.value.find((d) => d.id === selectedDashboardId.value) ?? null) : null,
    );

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
                <GranularitySelector v-model:granularity="granularity" />
                <DateTimeRangePicker v-model:date-range="dateRange" />
            </PageHeader>

            <DashboardFilters
                v-model:repository-ids="repositoryIds"
                v-model:topics="topics"
                v-model:default-branch-only="defaultBranchOnly"
                v-model:users-only="usersOnly"
                v-model:group-by="groupBy"
            />

            <WidgetGrid
                :dashboard="currentDashboard"
                :filter="metricsFilter"
            />
        </template>

        <!-- Dashboard List View -->
        <template v-else>
            <PageHeader description="View built-in DORA &amp; SPACE dashboards">
                <GranularitySelector v-model:granularity="granularity" />
                <DateTimeRangePicker v-model:date-range="dateRange" />
            </PageHeader>

            <DashboardList
                :dashboards="dashboards"
                @select="onSelectDashboard"
            />
        </template>
    </div>
</template>
