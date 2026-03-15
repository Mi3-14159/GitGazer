<script setup lang="ts">
    import Card from '@/components/ui/Card.vue';
    import CardContent from '@/components/ui/CardContent.vue';
    import CardHeader from '@/components/ui/CardHeader.vue';
    import CardTitle from '@/components/ui/CardTitle.vue';
    import type {OverviewResponse} from '@common/types';
    import {Activity, CheckCircle2, Clock, XCircle} from 'lucide-vue-next';

    defineProps<{
        stats: OverviewResponse['stats'];
        successRate: string;
    }>();
</script>

<template>
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
            <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle class="text-sm font-medium">Total Workflows</CardTitle>
                <Activity class="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div class="text-2xl font-bold">{{ stats.total }}</div>
                <p class="text-xs text-muted-foreground">Active pipelines</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle class="text-sm font-medium">Successful Runs</CardTitle>
                <CheckCircle2 class="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
                <div class="text-2xl font-bold">{{ stats.success }}</div>
                <p class="text-xs text-muted-foreground">{{ successRate }}% success rate</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle class="text-sm font-medium">Failed Runs</CardTitle>
                <XCircle class="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
                <div class="text-2xl font-bold">{{ stats.failure }}</div>
                <p class="text-xs text-muted-foreground">Requires attention</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle class="text-sm font-medium">In Progress</CardTitle>
                <Clock class="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
                <div class="text-2xl font-bold">{{ stats.inProgress }}</div>
                <p class="text-xs text-muted-foreground">Currently running</p>
            </CardContent>
        </Card>
    </div>
</template>
