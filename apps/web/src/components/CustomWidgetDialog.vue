<script setup lang="ts">
    import CodeMirrorEditor from '@/components/CodeMirrorEditor.vue';
    import {useCustomMetrics} from '@/composables/useCustomMetrics';
    import type {ChartType, CustomQueryColumn, CustomWidget, TableSchema, WidgetColumnConfig} from '@common/types/metrics';
    import {computed, ref, watch} from 'vue';

    const props = defineProps<{
        integrationId: string | null;
        schema: TableSchema[];
        editWidget?: CustomWidget;
    }>();

    const emit = defineEmits<{
        save: [widget: {title: string; query: string; chartType: ChartType; config: WidgetColumnConfig}];
        cancel: [];
    }>();

    const {executeQuery, isExecuting, queryError} = useCustomMetrics();

    const title = ref(props.editWidget?.title ?? '');
    const queryText = ref(props.editWidget?.query ?? '');
    const chartType = ref<ChartType>(props.editWidget?.chartType ?? 'table');
    const config = ref<WidgetColumnConfig>(props.editWidget?.config ?? {});
    const testColumns = ref<CustomQueryColumn[]>([]);
    const testRows = ref<Record<string, unknown>[]>([]);
    const hasTestedQuery = ref(false);

    const chartTypeOptions: {title: string; value: ChartType; icon: string}[] = [
        {title: 'Data Table', value: 'table', icon: 'mdi-table'},
        {title: 'Line Chart', value: 'line', icon: 'mdi-chart-line'},
        {title: 'Bar Chart', value: 'bar', icon: 'mdi-chart-bar'},
        {title: 'Stacked Bar', value: 'stacked-bar', icon: 'mdi-chart-bar-stacked'},
        {title: 'Multi-line', value: 'multi-line', icon: 'mdi-chart-multiline'},
        {title: 'Gauge', value: 'gauge', icon: 'mdi-gauge'},
    ];

    const needsAxisConfig = computed(() => ['line', 'bar', 'stacked-bar', 'multi-line'].includes(chartType.value));
    const needsSeriesColumn = computed(() => ['stacked-bar', 'multi-line'].includes(chartType.value));
    const needsValueColumn = computed(() => chartType.value === 'gauge');

    const columnOptions = computed(() => testColumns.value.map((c) => c.name));
    const numericColumns = computed(() => testColumns.value.filter((c) => c.type === 'number').map((c) => c.name));

    const editorSchema = computed(() => {
        const schemaMap: Record<string, string[]> = {};
        for (const table of props.schema) {
            schemaMap[`${table.schema}.${table.table}`] = table.columns.map((c) => c.name);
        }
        return schemaMap;
    });

    const isValid = computed(() => {
        if (!title.value.trim() || !queryText.value.trim()) return false;
        if (!hasTestedQuery.value) return false;
        if (needsAxisConfig.value && (!config.value.xAxis || !config.value.yAxis)) return false;
        if (needsValueColumn.value && !config.value.valueColumn) return false;
        return true;
    });

    watch(chartType, () => {
        config.value = {};
    });

    async function handleTestQuery() {
        if (!props.integrationId || !queryText.value.trim()) return;
        const result = await executeQuery(props.integrationId, queryText.value);
        if (result) {
            testColumns.value = result.columns;
            testRows.value = result.rows.slice(0, 10);
            hasTestedQuery.value = true;
            // Auto-assign columns if possible
            if (result.columns.length >= 2) {
                const numCols = result.columns.filter((c) => c.type === 'number');
                const strCols = result.columns.filter((c) => c.type !== 'number');
                if (strCols.length > 0 && numCols.length > 0) {
                    config.value.xAxis = config.value.xAxis ?? strCols[0].name;
                    config.value.yAxis = config.value.yAxis ?? numCols[0].name;
                }
                if (numCols.length > 0) {
                    config.value.valueColumn = config.value.valueColumn ?? numCols[0].name;
                }
            }
        }
    }

    function handleSave() {
        emit('save', {
            title: title.value,
            query: queryText.value,
            chartType: chartType.value,
            config: config.value,
        });
    }
</script>

<template>
    <v-card
        min-width="700"
        max-width="900"
    >
        <v-card-title class="d-flex align-center pa-4">
            <v-icon
                class="mr-2"
                size="small"
                >mdi-chart-box-plus-outline</v-icon
            >
            {{ editWidget ? 'Edit Widget' : 'Add Widget' }}
        </v-card-title>

        <v-divider />

        <v-card-text class="pa-4">
            <v-text-field
                v-model="title"
                label="Widget Title"
                variant="outlined"
                density="compact"
                hide-details
                class="mb-4"
                placeholder="e.g. Weekly Deployment Count"
            />

            <p class="text-subtitle-2 text-medium-emphasis mb-2">SQL Query</p>
            <CodeMirrorEditor
                v-model="queryText"
                :schema="editorSchema"
                max-height="200px"
            />

            <div class="d-flex align-center mt-3 mb-4 ga-2">
                <v-btn
                    color="primary"
                    variant="tonal"
                    size="small"
                    :loading="isExecuting"
                    :disabled="!integrationId || !queryText.trim()"
                    @click="handleTestQuery"
                >
                    <v-icon
                        start
                        size="small"
                        >mdi-play</v-icon
                    >
                    Test Query
                </v-btn>
                <v-chip
                    v-if="hasTestedQuery && !queryError"
                    color="success"
                    variant="tonal"
                    size="small"
                >
                    {{ testRows.length }} rows returned
                </v-chip>
                <v-chip
                    v-if="queryError"
                    color="error"
                    variant="tonal"
                    size="small"
                >
                    {{ queryError }}
                </v-chip>
            </div>

            <!-- Preview table -->
            <v-data-table
                v-if="hasTestedQuery && testRows.length > 0 && !queryError"
                :headers="testColumns.map((c) => ({title: c.name, key: c.name, sortable: false}))"
                :items="testRows"
                density="compact"
                class="mb-4 elevation-0"
                items-per-page="5"
                style="max-height: 200px; overflow: auto"
            />

            <v-divider class="mb-4" />

            <p class="text-subtitle-2 text-medium-emphasis mb-2">Visualization</p>
            <v-select
                v-model="chartType"
                :items="chartTypeOptions"
                label="Chart Type"
                variant="outlined"
                density="compact"
                hide-details
                class="mb-3"
            >
                <template #item="{props: itemProps, item}">
                    <v-list-item v-bind="itemProps">
                        <template #prepend>
                            <v-icon size="small">{{ item.raw.icon }}</v-icon>
                        </template>
                    </v-list-item>
                </template>
            </v-select>

            <!-- Column mapping for chart types -->
            <template v-if="hasTestedQuery && testColumns.length > 0">
                <v-row
                    v-if="needsAxisConfig"
                    dense
                    class="mb-2"
                >
                    <v-col cols="6">
                        <v-select
                            v-model="config.xAxis"
                            :items="columnOptions"
                            label="X-Axis Column"
                            variant="outlined"
                            density="compact"
                            hide-details
                        />
                    </v-col>
                    <v-col cols="6">
                        <v-select
                            v-model="config.yAxis"
                            :items="numericColumns.length > 0 ? numericColumns : columnOptions"
                            label="Y-Axis Column"
                            variant="outlined"
                            density="compact"
                            hide-details
                        />
                    </v-col>
                </v-row>
                <v-select
                    v-if="needsSeriesColumn"
                    v-model="config.seriesColumn"
                    :items="columnOptions"
                    label="Series Column (group by)"
                    variant="outlined"
                    density="compact"
                    hide-details
                    class="mb-2"
                />
                <v-select
                    v-if="needsValueColumn"
                    v-model="config.valueColumn"
                    :items="numericColumns.length > 0 ? numericColumns : columnOptions"
                    label="Value Column"
                    variant="outlined"
                    density="compact"
                    hide-details
                    class="mb-2"
                />
            </template>
        </v-card-text>

        <v-divider />

        <v-card-actions class="pa-4">
            <v-spacer />
            <v-btn
                variant="text"
                @click="emit('cancel')"
                >Cancel</v-btn
            >
            <v-btn
                color="primary"
                variant="flat"
                :disabled="!isValid"
                @click="handleSave"
            >
                {{ editWidget ? 'Update' : 'Add Widget' }}
            </v-btn>
        </v-card-actions>
    </v-card>
</template>
