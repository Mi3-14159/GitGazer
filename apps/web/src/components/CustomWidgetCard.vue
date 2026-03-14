<script setup lang="ts">
    import EChart from '@/components/charts/EChart.vue';
    import {useChartTheme} from '@/composables/useChartTheme';
    import type {CustomQueryResponse, CustomWidget} from '@common/types/metrics';
    import {AlertCircle, GripVertical, Pencil, RefreshCw, Trash2} from 'lucide-vue-next';
    import {computed} from 'vue';

    const props = defineProps<{
        widget: CustomWidget;
        result?: CustomQueryResponse;
        error?: string;
    }>();

    const emit = defineEmits<{
        edit: [];
        delete: [];
        refresh: [];
    }>();

    const chart = useChartTheme();

    const chartOption = computed(() => {
        if (!props.result || !props.result.rows.length) return null;
        const w = props.widget;
        const r = props.result;
        const cfg = w.config;

        if (w.chartType === 'gauge') {
            const val = Number(r.rows[0]?.[cfg.valueColumn ?? r.columns[0]?.name] ?? 0);
            return chart.buildGaugeChart({value: val, title: w.title});
        }

        if (w.chartType === 'table') return null; // Rendered as HTML table

        const xCol = cfg.xAxis ?? r.columns[0]?.name;
        const yCol = cfg.yAxis ?? r.columns[1]?.name;
        if (!xCol || !yCol) return null;

        const data = r.rows.map((row) => ({period: String(row[xCol] ?? ''), value: Number(row[yCol] ?? 0)}));

        if (w.chartType === 'bar' || w.chartType === 'stacked-bar') {
            return chart.buildBarChart({title: w.title, data, unit: '', granularity: 'raw'});
        }

        if (w.chartType === 'multi-line' && cfg.seriesColumn) {
            const groups = new Map<string, {period: string; value: number}[]>();
            for (const row of r.rows) {
                const key = String(row[cfg.seriesColumn] ?? 'default');
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push({period: String(row[xCol] ?? ''), value: Number(row[yCol] ?? 0)});
            }
            const colors = ['#42A5F5', '#66BB6A', '#FFA726', '#CE93D8', '#26C6DA', '#FF7043'];
            const series = [...groups.entries()].map(([name, d], i) => ({
                name,
                data: d,
                color: colors[i % colors.length],
                unit: '',
            }));
            return chart.buildMultiLineChart({series, granularity: 'raw'});
        }

        // Default: line chart
        return chart.buildLineChart({title: w.title, data, unit: '', granularity: 'raw', areaStyle: true});
    });
</script>

<template>
    <div class="h-full rounded-xl border bg-card flex flex-col overflow-hidden">
        <!-- Header -->
        <div class="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
            <div class="flex items-center gap-2 min-w-0">
                <GripVertical class="h-3.5 w-3.5 text-muted-foreground/50 cursor-grab shrink-0" />
                <span class="text-xs font-medium truncate">{{ widget.title }}</span>
            </div>
            <div class="flex gap-0.5 shrink-0">
                <button
                    class="p-1 rounded hover:bg-muted cursor-pointer"
                    @click="emit('refresh')"
                >
                    <RefreshCw class="h-3 w-3 text-muted-foreground" />
                </button>
                <button
                    class="p-1 rounded hover:bg-muted cursor-pointer"
                    @click="emit('edit')"
                >
                    <Pencil class="h-3 w-3 text-muted-foreground" />
                </button>
                <button
                    class="p-1 rounded hover:bg-muted cursor-pointer"
                    @click="emit('delete')"
                >
                    <Trash2 class="h-3 w-3 text-destructive" />
                </button>
            </div>
        </div>

        <!-- Body -->
        <div class="flex-1 p-2 overflow-auto">
            <!-- Error -->
            <div
                v-if="error"
                class="flex items-center gap-2 p-3 text-xs text-destructive"
            >
                <AlertCircle class="h-4 w-4 shrink-0" />
                <span>{{ error }}</span>
            </div>

            <!-- Loading -->
            <div
                v-else-if="!result"
                class="flex items-center justify-center h-full"
            >
                <div class="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>

            <!-- Table view -->
            <div
                v-else-if="widget.chartType === 'table'"
                class="overflow-auto"
            >
                <table class="w-full text-xs">
                    <thead>
                        <tr class="border-b">
                            <th
                                v-for="col in result.columns"
                                :key="col.name"
                                class="px-2 py-1.5 text-left font-medium text-muted-foreground"
                            >
                                {{ col.name }}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="(row, i) in result.rows.slice(0, 100)"
                            :key="i"
                            class="border-b last:border-b-0 hover:bg-muted/30"
                        >
                            <td
                                v-for="col in result.columns"
                                :key="col.name"
                                class="px-2 py-1.5 truncate max-w-[200px]"
                            >
                                {{ row[col.name] ?? '—' }}
                            </td>
                        </tr>
                    </tbody>
                </table>
                <div
                    v-if="result.rowCount > 100"
                    class="text-[10px] text-muted-foreground text-center py-1"
                >
                    Showing 100 of {{ result.rowCount }} rows
                </div>
            </div>

            <!-- Chart view -->
            <EChart
                v-else-if="chartOption"
                :option="chartOption"
                height="100%"
            />

            <!-- No data -->
            <div
                v-else
                class="flex items-center justify-center h-full text-xs text-muted-foreground"
            >
                No data
            </div>
        </div>
    </div>
</template>
