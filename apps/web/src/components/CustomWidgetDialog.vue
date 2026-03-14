<script setup lang="ts">
    import CodeMirrorEditor from '@/components/CodeMirrorEditor.vue';
    import Badge from '@/components/ui/Badge.vue';
    import Button from '@/components/ui/Button.vue';
    import Input from '@/components/ui/Input.vue';
    import Label from '@/components/ui/Label.vue';
    import {useCustomMetrics} from '@/composables/useCustomMetrics';
    import type {ChartType, CustomWidget, WidgetColumnConfig} from '@common/types/metrics';
    import {AlertCircle, Database, Play, Table2} from 'lucide-vue-next';
    import {computed, onMounted, ref} from 'vue';

    const props = defineProps<{
        existingWidget?: CustomWidget | null;
        integrationId: string;
        onClose: () => void;
        onSave: (params: {title: string; query: string; chartType: ChartType; config: WidgetColumnConfig}) => void;
    }>();

    const {executeQuery, queryResult, queryError, isExecuting, fetchSchema, schema} = useCustomMetrics();

    const title = ref(props.existingWidget?.title ?? '');
    const query = ref(props.existingWidget?.query ?? 'SELECT * FROM workflow_runs LIMIT 10');
    const chartType = ref<ChartType>(props.existingWidget?.chartType ?? 'line');
    const config = ref<WidgetColumnConfig>(props.existingWidget?.config ?? {});

    const chartTypes: {value: ChartType; label: string}[] = [
        {value: 'line', label: 'Line'},
        {value: 'bar', label: 'Bar'},
        {value: 'stacked-bar', label: 'Stacked Bar'},
        {value: 'gauge', label: 'Gauge'},
        {value: 'multi-line', label: 'Multi-Line'},
        {value: 'table', label: 'Table'},
    ];

    const columns = computed(() => queryResult.value?.columns ?? []);

    onMounted(async () => {
        await fetchSchema();
    });

    async function handleRun() {
        if (!props.integrationId || !query.value.trim()) return;
        await executeQuery(props.integrationId, query.value);
    }

    function handleSave() {
        if (!title.value.trim()) return;
        props.onSave({
            title: title.value.trim(),
            query: query.value,
            chartType: chartType.value,
            config: config.value,
        });
    }
</script>

<template>
    <div>
        <h3 class="text-lg font-semibold mb-4">{{ props.existingWidget ? 'Edit Widget' : 'New Widget' }}</h3>

        <div class="space-y-4">
            <!-- Title -->
            <div class="space-y-2">
                <Label>Title</Label>
                <Input
                    v-model="title"
                    placeholder="Widget title"
                />
            </div>

            <!-- SQL Editor -->
            <div class="space-y-2">
                <div class="flex items-center justify-between">
                    <Label>SQL Query</Label>
                    <Button
                        size="sm"
                        variant="outline"
                        :disabled="isExecuting"
                        @click="handleRun"
                    >
                        <Play class="h-3 w-3" />
                        {{ isExecuting ? 'Running...' : 'Run' }}
                    </Button>
                </div>
                <div class="rounded-lg border overflow-hidden">
                    <CodeMirrorEditor
                        v-model="query"
                        :height="150"
                    />
                </div>
            </div>

            <!-- Schema Reference -->
            <details
                v-if="schema.length > 0"
                class="text-xs"
            >
                <summary class="flex items-center gap-1 cursor-pointer text-muted-foreground hover:text-foreground">
                    <Database class="h-3 w-3" />
                    Available tables
                </summary>
                <div class="mt-2 max-h-40 overflow-y-auto rounded-lg border bg-muted/30 p-2 space-y-2">
                    <div
                        v-for="t in schema"
                        :key="`${t.schema}.${t.table}`"
                    >
                        <div class="font-medium text-foreground">{{ t.schema }}.{{ t.table }}</div>
                        <div class="flex flex-wrap gap-1 mt-0.5">
                            <Badge
                                v-for="col in t.columns"
                                :key="col.name"
                                variant="outline"
                                class="text-[10px]"
                            >
                                {{ col.name }} <span class="text-muted-foreground ml-0.5">({{ col.type }})</span>
                            </Badge>
                        </div>
                    </div>
                </div>
            </details>

            <!-- Query Error -->
            <div
                v-if="queryError"
                class="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
            >
                <AlertCircle class="h-4 w-4 shrink-0 mt-0.5" />
                <span>{{ queryError }}</span>
            </div>

            <!-- Query Results Preview -->
            <div
                v-if="queryResult"
                class="space-y-2"
            >
                <div class="flex items-center gap-2 text-xs text-muted-foreground">
                    <Table2 class="h-3 w-3" />
                    {{ queryResult.rowCount }} row{{ queryResult.rowCount !== 1 ? 's' : '' }} returned
                </div>
                <div class="max-h-40 overflow-auto rounded-lg border">
                    <table class="w-full text-xs">
                        <thead>
                            <tr class="border-b bg-muted/50">
                                <th
                                    v-for="col in queryResult.columns"
                                    :key="col.name"
                                    class="px-2 py-1.5 text-left font-medium text-muted-foreground"
                                >
                                    {{ col.name }}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="(row, i) in queryResult.rows.slice(0, 10)"
                                :key="i"
                                class="border-b last:border-b-0"
                            >
                                <td
                                    v-for="col in queryResult.columns"
                                    :key="col.name"
                                    class="px-2 py-1.5 truncate max-w-[150px]"
                                >
                                    {{ row[col.name] ?? '—' }}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Chart Type -->
            <div class="space-y-2">
                <Label>Chart Type</Label>
                <div class="flex flex-wrap gap-1.5">
                    <button
                        v-for="ct in chartTypes"
                        :key="ct.value"
                        :class="[
                            'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer',
                            chartType === ct.value
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background text-muted-foreground border-border hover:border-primary/30',
                        ]"
                        @click="chartType = ct.value"
                    >
                        {{ ct.label }}
                    </button>
                </div>
            </div>

            <!-- Column Mapping -->
            <div
                v-if="columns.length > 0 && chartType !== 'table'"
                class="space-y-3"
            >
                <Label>Column Mapping</Label>
                <div class="grid grid-cols-2 gap-3">
                    <div
                        v-if="chartType !== 'gauge'"
                        class="space-y-1"
                    >
                        <label class="text-xs text-muted-foreground">X-Axis</label>
                        <select
                            v-model="config.xAxis"
                            class="w-full h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                            <option :value="undefined">Auto</option>
                            <option
                                v-for="col in columns"
                                :key="col.name"
                                :value="col.name"
                            >
                                {{ col.name }}
                            </option>
                        </select>
                    </div>
                    <div
                        v-if="chartType !== 'gauge'"
                        class="space-y-1"
                    >
                        <label class="text-xs text-muted-foreground">Y-Axis</label>
                        <select
                            v-model="config.yAxis"
                            class="w-full h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                            <option :value="undefined">Auto</option>
                            <option
                                v-for="col in columns"
                                :key="col.name"
                                :value="col.name"
                            >
                                {{ col.name }}
                            </option>
                        </select>
                    </div>
                    <div
                        v-if="chartType === 'multi-line'"
                        class="space-y-1"
                    >
                        <label class="text-xs text-muted-foreground">Series Column</label>
                        <select
                            v-model="config.seriesColumn"
                            class="w-full h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                            <option :value="undefined">None</option>
                            <option
                                v-for="col in columns"
                                :key="col.name"
                                :value="col.name"
                            >
                                {{ col.name }}
                            </option>
                        </select>
                    </div>
                    <div
                        v-if="chartType === 'gauge'"
                        class="space-y-1"
                    >
                        <label class="text-xs text-muted-foreground">Value Column</label>
                        <select
                            v-model="config.valueColumn"
                            class="w-full h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                            <option :value="undefined">Auto (first column)</option>
                            <option
                                v-for="col in columns"
                                :key="col.name"
                                :value="col.name"
                            >
                                {{ col.name }}
                            </option>
                        </select>
                    </div>
                </div>
            </div>
        </div>

        <div class="flex justify-end gap-2 mt-6 pt-4 border-t">
            <Button
                variant="outline"
                @click="props.onClose"
                >Cancel</Button
            >
            <Button
                :disabled="!title.trim()"
                @click="handleSave"
                >{{ props.existingWidget ? 'Update' : 'Add Widget' }}</Button
            >
        </div>
    </div>
</template>
