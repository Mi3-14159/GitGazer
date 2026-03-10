import {useSettingsStore} from '@/stores/settings';
import type {MetricDataPoint} from '@common/types/metrics';
import {computed} from 'vue';

const COLORS = {
    light: {
        primary: '#1867C0',
        success: '#4CAF50',
        warning: '#FB8C00',
        error: '#FF5252',
        info: '#2196F3',
        series: ['#1867C0', '#4CAF50', '#FB8C00', '#9C27B0', '#00BCD4', '#FF5722'],
        text: '#212121',
        subText: '#757575',
        axisLine: '#E0E0E0',
        splitLine: '#F5F5F5',
        background: 'transparent',
    },
    dark: {
        primary: '#42A5F5',
        success: '#66BB6A',
        warning: '#FFA726',
        error: '#EF5350',
        info: '#29B6F6',
        series: ['#42A5F5', '#66BB6A', '#FFA726', '#CE93D8', '#26C6DA', '#FF7043'],
        text: '#EEEEEE',
        subText: '#9E9E9E',
        axisLine: '#424242',
        splitLine: '#303030',
        background: 'transparent',
    },
};

export function useChartTheme() {
    const settingsStore = useSettingsStore();
    const palette = computed(() => COLORS[settingsStore.resolvedTheme]);

    function formatPeriodLabel(iso: string, granularity: string): string {
        const d = new Date(iso);
        if (granularity === 'day') return d.toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
        if (granularity === 'month') return d.toLocaleDateString(undefined, {year: 'numeric', month: 'short'});
        // week
        return d.toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
    }

    function buildLineChart(params: {
        title: string;
        data: MetricDataPoint[];
        unit: string;
        granularity: string;
        color?: string;
        areaStyle?: boolean;
        markLines?: {value: number; label: string; color: string}[];
    }) {
        const c = palette.value;
        const labels = params.data.map((d) => formatPeriodLabel(d.period, params.granularity));
        const values = params.data.map((d) => d.value);

        return {
            tooltip: {
                trigger: 'axis',
                formatter: (p: any) => {
                    const point = p[0];
                    return `${point.axisValueLabel}<br/>${point.marker} ${point.value} ${params.unit}`;
                },
            },
            grid: {left: 50, right: 20, top: 30, bottom: 40},
            xAxis: {
                type: 'category',
                data: labels,
                axisLine: {lineStyle: {color: c.axisLine}},
                axisLabel: {color: c.subText, fontSize: 11},
            },
            yAxis: {
                type: 'value',
                splitLine: {lineStyle: {color: c.splitLine}},
                axisLabel: {color: c.subText, fontSize: 11},
            },
            series: [
                {
                    type: 'line',
                    data: values,
                    smooth: true,
                    symbol: 'circle',
                    symbolSize: 6,
                    itemStyle: {color: params.color ?? c.primary},
                    lineStyle: {width: 2.5},
                    ...(params.areaStyle
                        ? {
                              areaStyle: {
                                  color: {
                                      type: 'linear',
                                      x: 0,
                                      y: 0,
                                      x2: 0,
                                      y2: 1,
                                      colorStops: [
                                          {offset: 0, color: (params.color ?? c.primary) + '40'},
                                          {offset: 1, color: (params.color ?? c.primary) + '05'},
                                      ],
                                  },
                              },
                          }
                        : {}),
                    ...(params.markLines
                        ? {
                              markLine: {
                                  silent: true,
                                  data: params.markLines.map((ml) => ({
                                      yAxis: ml.value,
                                      label: {formatter: ml.label, color: ml.color, fontSize: 10},
                                      lineStyle: {color: ml.color, type: 'dashed'},
                                  })),
                              },
                          }
                        : {}),
                },
            ],
        };
    }

    function buildBarChart(params: {title: string; data: MetricDataPoint[]; unit: string; granularity: string; color?: string}) {
        const c = palette.value;
        const labels = params.data.map((d) => formatPeriodLabel(d.period, params.granularity));
        const values = params.data.map((d) => d.value);

        return {
            tooltip: {
                trigger: 'axis',
                formatter: (p: any) => {
                    const point = p[0];
                    return `${point.axisValueLabel}<br/>${point.marker} ${point.value} ${params.unit}`;
                },
            },
            grid: {left: 50, right: 20, top: 30, bottom: 40},
            xAxis: {
                type: 'category',
                data: labels,
                axisLine: {lineStyle: {color: c.axisLine}},
                axisLabel: {color: c.subText, fontSize: 11},
            },
            yAxis: {
                type: 'value',
                splitLine: {lineStyle: {color: c.splitLine}},
                axisLabel: {color: c.subText, fontSize: 11},
            },
            series: [
                {
                    type: 'bar',
                    data: values,
                    itemStyle: {
                        color: {
                            type: 'linear',
                            x: 0,
                            y: 0,
                            x2: 0,
                            y2: 1,
                            colorStops: [
                                {offset: 0, color: params.color ?? c.primary},
                                {offset: 1, color: (params.color ?? c.primary) + '80'},
                            ],
                        },
                        borderRadius: [4, 4, 0, 0],
                    },
                    barMaxWidth: 40,
                },
            ],
        };
    }

    function buildGaugeChart(params: {value: number; title: string; max?: number; color?: string}) {
        const c = palette.value;
        return {
            series: [
                {
                    type: 'gauge',
                    startAngle: 200,
                    endAngle: -20,
                    min: 0,
                    max: params.max ?? 100,
                    pointer: {show: false},
                    progress: {
                        show: true,
                        width: 14,
                        roundCap: true,
                        itemStyle: {color: params.color ?? c.primary},
                    },
                    axisLine: {lineStyle: {width: 14, color: [[1, c.splitLine]]}},
                    axisTick: {show: false},
                    splitLine: {show: false},
                    axisLabel: {show: false},
                    detail: {
                        valueAnimation: true,
                        formatter: '{value}%',
                        fontSize: 24,
                        fontWeight: 'bold',
                        color: c.text,
                        offsetCenter: [0, '0%'],
                    },
                    title: {
                        fontSize: 12,
                        color: c.subText,
                        offsetCenter: [0, '30%'],
                    },
                    data: [{value: Math.round(params.value * 10) / 10, name: params.title}],
                },
            ],
        };
    }

    function buildMultiLineChart(params: {series: {name: string; data: MetricDataPoint[]; color: string; unit: string}[]; granularity: string}) {
        const c = palette.value;
        // Merge all periods from all series
        const allPeriods = [...new Set(params.series.flatMap((s) => s.data.map((d) => d.period)))].sort();
        const labels = allPeriods.map((p) => formatPeriodLabel(p, params.granularity));

        return {
            tooltip: {trigger: 'axis'},
            legend: {
                data: params.series.map((s) => s.name),
                textStyle: {color: c.subText, fontSize: 11},
                bottom: 0,
            },
            grid: {left: 50, right: 20, top: 20, bottom: 40},
            xAxis: {
                type: 'category',
                data: labels,
                axisLine: {lineStyle: {color: c.axisLine}},
                axisLabel: {color: c.subText, fontSize: 11},
            },
            yAxis: {
                type: 'value',
                splitLine: {lineStyle: {color: c.splitLine}},
                axisLabel: {color: c.subText, fontSize: 11},
            },
            series: params.series.map((s) => {
                const periodMap = new Map(s.data.map((d) => [d.period, d.value]));
                return {
                    name: s.name,
                    type: 'line',
                    data: allPeriods.map((p) => periodMap.get(p) ?? 0),
                    smooth: true,
                    symbol: 'circle',
                    symbolSize: 5,
                    itemStyle: {color: s.color},
                    lineStyle: {width: 2},
                };
            }),
        };
    }

    function buildStackedBarChart(params: {series: {name: string; data: MetricDataPoint[]; color: string}[]; unit: string; granularity: string}) {
        const c = palette.value;
        const allPeriods = [...new Set(params.series.flatMap((s) => s.data.map((d) => d.period)))].sort();
        const labels = allPeriods.map((p) => formatPeriodLabel(p, params.granularity));

        return {
            tooltip: {trigger: 'axis'},
            legend: {
                data: params.series.map((s) => s.name),
                textStyle: {color: c.subText, fontSize: 11},
                bottom: 0,
            },
            grid: {left: 50, right: 20, top: 20, bottom: 40},
            xAxis: {
                type: 'category',
                data: labels,
                axisLine: {lineStyle: {color: c.axisLine}},
                axisLabel: {color: c.subText, fontSize: 11},
            },
            yAxis: {
                type: 'value',
                splitLine: {lineStyle: {color: c.splitLine}},
                axisLabel: {color: c.subText, fontSize: 11},
            },
            series: params.series.map((s) => {
                const periodMap = new Map(s.data.map((d) => [d.period, d.value]));
                return {
                    name: s.name,
                    type: 'bar',
                    stack: 'total',
                    data: allPeriods.map((p) => periodMap.get(p) ?? 0),
                    itemStyle: {color: s.color},
                    barMaxWidth: 40,
                };
            }),
        };
    }

    return {
        palette,
        formatPeriodLabel,
        buildLineChart,
        buildBarChart,
        buildGaugeChart,
        buildMultiLineChart,
        buildStackedBarChart,
    };
}
