<script setup lang="ts">
    import MetricWidget from '@/components/analytics/widgets/MetricWidget.vue';
    import Badge from '@/components/ui/Badge.vue';
    import Card from '@/components/ui/Card.vue';
    import CardContent from '@/components/ui/CardContent.vue';
    import CardDescription from '@/components/ui/CardDescription.vue';
    import CardHeader from '@/components/ui/CardHeader.vue';
    import CardTitle from '@/components/ui/CardTitle.vue';
    import {useMetrics} from '@/composables/useMetric';
    import type {Dashboard, WidgetType} from '@/types/analytics';
    import {widgetCalculationInfo} from '@/types/analytics';
    import type {MetricResult, MetricsFilter} from '@common/types';
    import {Lock} from 'lucide-vue-next';
    import {onBeforeUnmount, reactive, toRef, watch} from 'vue';

    const COMING_SOON_WIDGETS: ReadonlySet<WidgetType> = new Set(['lead_time']);

    const props = defineProps<{
        dashboard: Dashboard;
        filter: MetricsFilter;
    }>();

    const {fetchWidgetMetric} = useMetrics();
    const metrics = reactive<Record<string, MetricResult | null>>({});
    const loadingWidgets = reactive<Record<string, boolean>>({});
    const abortControllers = new Map<string, AbortController>();

    async function loadWidgetMetric(widgetType: WidgetType) {
        const filter = props.filter;
        if (!filter.from && !filter.to) return;
        if (COMING_SOON_WIDGETS.has(widgetType)) return;

        abortControllers.get(widgetType)?.abort();
        const controller = new AbortController();
        abortControllers.set(widgetType, controller);

        loadingWidgets[widgetType] = true;
        try {
            const result = await fetchWidgetMetric(widgetType, filter, controller.signal);
            if (controller.signal.aborted) return;
            metrics[widgetType] = result;
        } catch (e) {
            if (e instanceof DOMException && e.name === 'AbortError') return;
            metrics[widgetType] = null;
        } finally {
            if (!controller.signal.aborted) {
                loadingWidgets[widgetType] = false;
            }
        }
    }

    function loadAllWidgets() {
        for (const widget of props.dashboard.widgets) {
            loadWidgetMetric(widget.type);
        }
    }

    onBeforeUnmount(() => {
        for (const controller of abortControllers.values()) {
            controller.abort();
        }
    });

    watch([toRef(props, 'dashboard'), toRef(props, 'filter')], loadAllWidgets, {deep: true, immediate: true});

    const widgetColorMap: Record<string, string> = {
        deployment_frequency: '#22c55e',
        lead_time: '#3b82f6',
        mttr: '#a855f7',
        change_failure_rate: '#ef4444',
        pr_merge_rate: '#10b981',
        activity_volume: '#f97316',
        ci_duration: '#06b6d4',
        pr_cycle_time: '#6366f1',
        workflow_queue_time: '#f59e0b',
        contributor_count: '#ec4899',
        pr_size: '#8b5cf6',
        pr_review_time: '#14b8a6',
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
                <MetricWidget
                    v-for="widget in dashboard.widgets"
                    :key="widget.id"
                    :title="widget.title"
                    :size="widget.size"
                    :description="widgetCalculationInfo[widget.type]"
                    :metric="metrics[widget.type] ?? null"
                    :is-loading="!!loadingWidgets[widget.type]"
                    :color="widgetColorMap[widget.type]"
                    :coming-soon="COMING_SOON_WIDGETS.has(widget.type)"
                />
            </div>
        </CardContent>
    </Card>
</template>
