<script setup lang="ts">
    import DashboardFilters from '@/components/analytics/DashboardFilters.vue';
    import DashboardList from '@/components/analytics/DashboardList.vue';
    import WidgetGrid from '@/components/analytics/WidgetGrid.vue';
    import DateTimeRangePicker, {type DateRange} from '@/components/DateTimeRangePicker.vue';
    import GranularitySelector from '@/components/GranularitySelector.vue';
    import PageHeader from '@/components/PageHeader.vue';
    import Button from '@/components/ui/Button.vue';
    import {type Dashboard, defaultDashboards} from '@/types/analytics';
    import type {Granularity, GroupByOption, MetricsFilter} from '@common/types';
    import {ArrowLeft} from 'lucide-vue-next';
    import {computed, onMounted, ref, watch} from 'vue';
    import {useRoute, useRouter} from 'vue-router';

    const route = useRoute();
    const router = useRouter();

    const validGranularities: Granularity[] = ['hour', 'day', 'week', 'month'];
    const validGroupBy: GroupByOption[] = ['none', 'repository'];

    // Resolve initial state from URL query params, falling back to defaults
    const qGranularity = route.query.granularity as string | undefined;
    const qRepos = route.query.repos as string | undefined;
    const qDefaultBranch = route.query.defaultBranch as string | undefined;
    const qUsersOnly = route.query.usersOnly as string | undefined;
    const qGroupBy = route.query.groupBy as string | undefined;

    const selectedDashboardId = ref<string | null>((route.params.dashboardId as string) || null);
    const dateRange = ref<DateRange>({});
    const granularity = ref<Granularity>(
        qGranularity && validGranularities.includes(qGranularity as Granularity) ? (qGranularity as Granularity) : 'day',
    );
    const dashboards = ref<Dashboard[]>([...defaultDashboards]);

    // Filter state (URL overrides defaults)
    const repositoryIds = ref<number[]>(qRepos ? qRepos.split(',').map(Number).filter(Number.isFinite) : []);
    const defaultBranchOnly = ref(qDefaultBranch !== undefined ? qDefaultBranch === '1' : true);
    const usersOnly = ref(qUsersOnly !== undefined ? qUsersOnly === '1' : true);
    const groupBy = ref<GroupByOption>(qGroupBy && validGroupBy.includes(qGroupBy as GroupByOption) ? (qGroupBy as GroupByOption) : 'repository');

    const currentDashboard = computed(() =>
        selectedDashboardId.value ? (dashboards.value.find((d) => d.id === selectedDashboardId.value) ?? null) : null,
    );

    const metricsFilter = computed<MetricsFilter>(() => {
        const filter: MetricsFilter = {};
        if (dateRange.value.from) filter.from = dateRange.value.from.toISOString();
        if (dateRange.value.to) filter.to = dateRange.value.to.toISOString();
        filter.granularity = granularity.value;
        if (repositoryIds.value.length) filter.repositoryIds = repositoryIds.value;
        if (defaultBranchOnly.value) filter.defaultBranchOnly = true;
        if (usersOnly.value) filter.usersOnly = true;
        if (groupBy.value !== 'none') filter.groupBy = groupBy.value;
        return filter;
    });

    // Sync filter state → URL (preserves params managed by DateTimeRangePicker)
    function syncFiltersToUrl() {
        const query: Record<string, string | undefined> = {};
        // Preserve date-related params managed by DateTimeRangePicker
        for (const [key, val] of Object.entries(route.query)) {
            if (['window', 'created_from', 'created_to'].includes(key) && typeof val === 'string') {
                query[key] = val;
            }
        }

        query.granularity = granularity.value;
        query.repos = repositoryIds.value.length ? repositoryIds.value.join(',') : undefined;
        query.defaultBranch = defaultBranchOnly.value ? '1' : '0';
        query.usersOnly = usersOnly.value ? '1' : '0';
        query.groupBy = groupBy.value;

        router.replace({query});
    }

    onMounted(() => {
        syncFiltersToUrl();
    });

    watch([granularity, repositoryIds, defaultBranchOnly, usersOnly, groupBy], syncFiltersToUrl, {deep: true});

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

            <div class="flex justify-end">
                <DashboardFilters
                    v-model:repository-ids="repositoryIds"
                    v-model:default-branch-only="defaultBranchOnly"
                    v-model:users-only="usersOnly"
                    v-model:group-by="groupBy"
                />
            </div>

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
