<script setup lang="ts">
    import Card from '@/components/ui/Card.vue';
    import CardContent from '@/components/ui/CardContent.vue';
    import CardHeader from '@/components/ui/CardHeader.vue';
    import CardTitle from '@/components/ui/CardTitle.vue';
    import type {EventLogStats} from '@common/types';
    import {Bell, BookCheck, BookOpen} from 'lucide-vue-next';

    defineProps<{
        stats: EventLogStats;
    }>();
</script>

<template>
    <div class="grid gap-4 md:grid-cols-3">
        <Card>
            <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle class="text-sm font-medium">Total Events</CardTitle>
                <Bell class="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div class="text-2xl font-bold">{{ stats.total }}</div>
            </CardContent>
        </Card>
        <Card>
            <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle class="text-sm font-medium">Unread</CardTitle>
                <BookOpen class="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
                <div class="text-2xl font-bold">{{ stats.unread }}</div>
            </CardContent>
        </Card>
        <Card>
            <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle class="text-sm font-medium">Read</CardTitle>
                <BookCheck class="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
                <div class="text-2xl font-bold">{{ stats.read }}</div>
            </CardContent>
        </Card>
    </div>
</template>
