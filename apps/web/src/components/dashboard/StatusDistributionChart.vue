<script setup lang="ts">
    import Card from '@/components/ui/Card.vue';
    import CardContent from '@/components/ui/CardContent.vue';
    import CardDescription from '@/components/ui/CardDescription.vue';
    import CardHeader from '@/components/ui/CardHeader.vue';
    import CardTitle from '@/components/ui/CardTitle.vue';
    import type {OverviewResponse} from '@common/types';
    import {computed} from 'vue';

    const props = defineProps<{
        stats: OverviewResponse['stats'];
    }>();

    const pieGradient = computed(() => {
        const total = props.stats.total || 1;
        const s = (props.stats.success / total) * 100;
        const f = (props.stats.failure / total) * 100;
        const p = (props.stats.inProgress / total) * 100;
        const sEnd = s;
        const fEnd = sEnd + f;
        const pEnd = fEnd + p;
        return `conic-gradient(#22c55e 0% ${sEnd}%, #ef4444 ${sEnd}% ${fEnd}%, #3b82f6 ${fEnd}% ${pEnd}%, #94a3b8 ${pEnd}% 100%)`;
    });
</script>

<template>
    <Card>
        <CardHeader>
            <CardTitle>Workflow Status Distribution</CardTitle>
            <CardDescription>Overview of all workflow statuses</CardDescription>
        </CardHeader>
        <CardContent class="flex justify-center">
            <div class="relative">
                <div
                    class="w-48 h-48 rounded-full"
                    :style="{background: pieGradient}"
                />
                <div class="mt-4 flex flex-wrap gap-3 justify-center text-xs">
                    <span class="flex items-center gap-1">
                        <span class="w-2 h-2 rounded-full bg-green-500" />
                        Success {{ stats.success }}
                    </span>
                    <span class="flex items-center gap-1">
                        <span class="w-2 h-2 rounded-full bg-red-500" />
                        Failed {{ stats.failure }}
                    </span>
                    <span class="flex items-center gap-1">
                        <span class="w-2 h-2 rounded-full bg-blue-500" />
                        In Progress {{ stats.inProgress }}
                    </span>
                    <span class="flex items-center gap-1">
                        <span class="w-2 h-2 rounded-full bg-gray-400" />
                        Other {{ stats.other }}
                    </span>
                </div>
            </div>
        </CardContent>
    </Card>
</template>
