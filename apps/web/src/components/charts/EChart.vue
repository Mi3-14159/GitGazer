<script setup lang="ts">
    import {useSettingsStore} from '@/stores/settings';
    import {BarChart, GaugeChart, LineChart} from 'echarts/charts';
    import {DataZoomComponent, GridComponent, LegendComponent, MarkLineComponent, TitleComponent, TooltipComponent} from 'echarts/components';
    import {use} from 'echarts/core';
    import {CanvasRenderer} from 'echarts/renderers';
    import {computed} from 'vue';
    import VChart from 'vue-echarts';

    use([
        CanvasRenderer,
        LineChart,
        BarChart,
        GaugeChart,
        TitleComponent,
        TooltipComponent,
        GridComponent,
        LegendComponent,
        MarkLineComponent,
        DataZoomComponent,
    ]);

    const props = withDefaults(
        defineProps<{
            option: Record<string, any>;
            height?: string;
            loading?: boolean;
        }>(),
        {
            height: '300px',
            loading: false,
        },
    );

    const settingsStore = useSettingsStore();
    const theme = computed(() => (settingsStore.resolvedTheme === 'dark' ? 'dark' : undefined));
</script>

<template>
    <v-chart
        :option="option"
        :theme="theme"
        :loading="loading"
        :style="{height, width: '100%'}"
        autoresize
    />
</template>
