<script setup lang="ts">
    import WidgetWrapper from '@/components/analytics/WidgetWrapper.vue';
    import MetricWidget from '@/components/analytics/widgets/MetricWidget.vue';
    import Badge from '@/components/ui/Badge.vue';
    import Card from '@/components/ui/Card.vue';
    import CardContent from '@/components/ui/CardContent.vue';
    import CardDescription from '@/components/ui/CardDescription.vue';
    import CardHeader from '@/components/ui/CardHeader.vue';
    import CardTitle from '@/components/ui/CardTitle.vue';
    import {metricFieldMap, useMetrics} from '@/composables/useMetric';
    import type {Dashboard, WidgetType} from '@/types/analytics';
    import type {MetricResult, MetricsFilter} from '@common/types';
    import {Lock} from 'lucide-vue-next';
    import {ref, toRef, watch} from 'vue';

    const props = defineProps<{
        dashboard: Dashboard;
        filter: MetricsFilter;
    }>();

    const {fetchDoraMetrics, fetchSpaceMetrics} = useMetrics();
    const metrics = ref<Partial<Record<WidgetType, MetricResult>>>({});
    const isLoading = ref(false);

    function needsEndpoint(endpoint: 'dora' | 'space'): boolean {
        return props.dashboard.widgets.some((w) => metricFieldMap[w.type]?.endpoint === endpoint);
    }

    async function loadMetrics() {
        const filter = props.filter;
        if (!filter.from && !filter.to) return;

        isLoading.value = true;
        try {
            const result: Partial<Record<WidgetType, MetricResult>> = {};
            const [dora, space] = await Promise.all([
                needsEndpoint('dora') ? fetchDoraMetrics(filter) : null,
                needsEndpoint('space') ? fetchSpaceMetrics(filter) : null,
            ]);

            for (const widget of props.dashboard.widgets) {
                const mapping = metricFieldMap[widget.type];
                if (!mapping) continue;
                const response = mapping.endpoint === 'dora' ? dora : space;
                if (response) {
                    result[widget.type] = (response as Record<string, MetricResult>)[mapping.field] ?? undefined;
                }
            }
            metrics.value = result;
        } catch {
            metrics.value = {};
        } finally {
            isLoading.value = false;
        }
    }

    watch([toRef(props, 'dashboard'), toRef(props, 'filter')], loadMetrics, {deep: true});

    const widgetColorMap: Record<string, string> = {
        deployment_frequency: 'bg-green-500',
        lead_time: 'bg-blue-500',
        mttr: 'bg-purple-500',
        change_failure_rate: 'bg-red-500',
        pr_merge_rate: 'bg-emerald-500',
        activity_volume: 'bg-orange-500',
        ci_duration: 'bg-cyan-500',
        pr_cycle_time: 'bg-indigo-500',
        workflow_queue_time: 'bg-amber-500',
        contributor_count: 'bg-pink-500',
    };
</script>

<template>
    <Card>
        <CardHeader>
            <div class="flex items-center justify-between">
                <div>
                    <CardTitle>{{ dashboard.name }}</CardTitle>
                    <CardDescription>
                        {{ dashboard.description }}
                        <Badge
                            v-if="dashboard.isDefault"
                            variant="outline"
                            class="ml-2"
                        >
                            <Lock class="mr-1 h-3 w-3" />
                            Built-in Dashboard
                        </Badge>
                    </CardDescription>
                </div>
            </div>
        </CardHeader>
        <CardContent>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                <WidgetWrapper
                    v-for="widget in dashboard.widgets"
                    :key="widget.id"
                    :title="widget.title"
                    :size="widget.size"
                    :removable="false"
                >
                    <MetricWidget
                        :metric="metrics[widget.type] ?? null"
                        :is-loading="isLoading"
                        :color="widgetColorMap[widget.type]"
                    />
                </WidgetWrapper>
            </div>
        </CardContent>
    </Card>
</template>
