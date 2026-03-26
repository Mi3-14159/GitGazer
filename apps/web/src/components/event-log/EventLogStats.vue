<script setup lang="ts">
    import type {EventLogStats} from '@common/types';
    import {Bell, BookCheck, BookOpen} from 'lucide-vue-next';

    defineProps<{
        stats: EventLogStats;
    }>();
</script>

<template>
    <div class="flex items-center gap-4 text-sm">
        <div class="flex items-center gap-1.5">
            <Bell class="h-3.5 w-3.5 text-muted-foreground" />
            <span class="text-muted-foreground">Total</span>
            <span class="font-semibold">{{ stats.total }}</span>
        </div>
        <span class="text-border">|</span>
        <div class="flex items-center gap-1.5">
            <BookOpen class="h-3.5 w-3.5 text-blue-500" />
            <span class="text-muted-foreground">Unread</span>
            <span class="font-semibold">{{ stats.unread }}</span>
        </div>
        <span class="text-border">|</span>
        <div class="flex items-center gap-1.5">
            <BookCheck class="h-3.5 w-3.5 text-green-500" />
            <span class="text-muted-foreground">Read</span>
            <span class="font-semibold">{{ stats.read }}</span>
        </div>
    </div>
</template>
