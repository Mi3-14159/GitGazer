<script setup lang="ts">
    import EChart from '@/components/charts/EChart.vue';
    import {useChartTheme} from '@/composables/useChartTheme';
    import type {CustomQueryResponse, CustomWidget, MetricDataPoint} from '@common/types/metrics';
    import {computed} from 'vue';

    const props = defineProps<{
        widget: CustomWidget;
        result?: CustomQueryResponse;
        loading?: boolean;
        error?: string;
    }>();

    defineEmits<{
        edit: [];
        remove: [];
    }>();

    const {palette, buildLineChart, buildBarChart, buildGaugeChart, buildMultiLineChart, buildStackedBarChart} = useChartTheme();

    function toDataPoints(rows: Record<string, unknown>[], xCol: string, yCol: string): MetricDataPoint[] {
        return rows.map((row) => ({
            period: String(row[xCol] ?? ''),
            value: Number(row[yCol] ?? 0),
        }));
    }

    function groupBySeries(
        rows: Record<string, unknown>[],
        seriesCol: string,
        xCol: string,
        yCol: string,
    ): {name: string; data: MetricDataPoint[]}[] {
        const groups = new Map<string, MetricDataPoint[]>();
        for (const row of rows) {
            const key = String(row[seriesCol] ?? 'unknown');
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push({
                period: String(row[xCol] ?? ''),
                value: Number(row[yCol] ?? 0),
            });
        }
        return Array.from(groups.entries()).map(([name, data]) => ({name, data}));
    }

    const chartOption = computed(() => {
        if (!props.result || props.result.rows.length === 0) return {};

        const {chartType, config} = props.widget;
        const rows = props.result.rows;
        const c = palette.value;

        if (chartType === 'line' && config.xAxis && config.yAxis) {
            return buildLineChart({
                title: props.widget.title,
                data: toDataPoints(rows, config.xAxis, config.yAxis),
                unit: config.yAxis,
                granularity: 'day',
                color: c.primary,
                areaStyle: true,
            });
        }

        if (chartType === 'bar' && config.xAxis && config.yAxis) {
            return buildBarChart({
                title: props.widget.title,
                data: toDataPoints(rows, config.xAxis, config.yAxis),
                unit: config.yAxis,
                granularity: 'day',
                color: c.primary,
            });
        }

        if (chartType === 'stacked-bar' && config.xAxis && config.yAxis && config.seriesColumn) {
            const series = groupBySeries(rows, config.seriesColumn, config.xAxis, config.yAxis);
            return buildStackedBarChart({
                series: series.map((s, i) => ({...s, color: c.series[i % c.series.length]})),
                unit: config.yAxis,
                granularity: 'day',
            });
        }

        if (chartType === 'multi-line' && config.xAxis && config.yAxis && config.seriesColumn) {
            const series = groupBySeries(rows, config.seriesColumn, config.xAxis, config.yAxis);
            return buildMultiLineChart({
                series: series.map((s, i) => ({...s, color: c.series[i % c.series.length], unit: config.yAxis!})),
                granularity: 'day',
            });
        }

        if (chartType === 'gauge' && config.valueColumn) {
            const val = Number(rows[0]?.[config.valueColumn] ?? 0);
            return buildGaugeChart({
                value: val,
                title: props.widget.title,
                color: c.primary,
            });
        }

        return {};
    });

    const tableHeaders = computed(() => {
        if (!props.result) return [];
        return props.result.columns.map((c) => ({title: c.name, key: c.name, sortable: true}));
    });
</script>

<template>
    <v-card
        variant="outlined"
        class="rounded-lg h-100 d-flex flex-column"
    >
        <v-card-item>
            <template #title>
                <div class="d-flex align-center">
                    <v-icon
                        color="primary"
                        size="small"
                        class="mr-2"
                        >mdi-chart-box</v-icon
                    >
                    <span class="text-truncate">{{ widget.title }}</span>
                </div>
            </template>
            <template #append>
                <v-btn
                    icon="mdi-pencil"
                    size="x-small"
                    variant="text"
                    @click="$emit('edit')"
                />
                <v-btn
                    icon="mdi-delete"
                    size="x-small"
                    variant="text"
                    color="error"
                    @click="$emit('remove')"
                />
            </template>
        </v-card-item>

        <v-card-text class="pt-0 flex-grow-1 d-flex flex-column">
            <v-progress-linear
                v-if="loading"
                indeterminate
                color="primary"
                class="mb-2"
            />

            <template v-if="result && result.rows.length > 0">
                <!-- Table view -->
                <v-data-table
                    v-if="widget.chartType === 'table'"
                    :headers="tableHeaders"
                    :items="result.rows"
                    density="compact"
                    class="elevation-0 flex-grow-1"
                    items-per-page="10"
                />

                <!-- Chart view -->
                <EChart
                    v-else
                    :option="chartOption"
                    height="100%"
                    :loading="loading"
                    style="min-height: 200px; flex: 1"
                />
            </template>

            <div
                v-else-if="error && !loading"
                class="d-flex flex-column align-center justify-center flex-grow-1"
                style="min-height: 120px"
            >
                <v-icon
                    size="40"
                    color="error"
                    class="mb-2"
                    >mdi-alert-circle</v-icon
                >
                <p class="text-body-2 text-error text-center px-4">{{ error }}</p>
            </div>

            <div
                v-else-if="!loading"
                class="d-flex flex-column align-center justify-center flex-grow-1"
                style="min-height: 120px"
            >
                <v-icon
                    size="40"
                    color="grey"
                    class="mb-2"
                    >mdi-database-search</v-icon
                >
                <p class="text-body-2 text-medium-emphasis">No data</p>
            </div>
        </v-card-text>
    </v-card>
</template>
