<script setup lang="ts">
    import EventCategoryFilter from '@/components/filters/EventCategoryFilter.vue';
    import EventTypeFilter from '@/components/filters/EventTypeFilter.vue';
    import ReadStatusFilter from '@/components/filters/ReadStatusFilter.vue';
    import Input from '@/components/ui/Input.vue';
    import type {EventLogCategory, EventLogReadFilter, EventLogType} from '@common/types';
    import {Search} from 'lucide-vue-next';

    const eventType = defineModel<EventLogType | 'all'>('type', {default: 'all'});
    const readStatus = defineModel<EventLogReadFilter>('read', {default: 'unread'});
    const category = defineModel<EventLogCategory | 'all'>('category', {default: 'all'});
    const search = defineModel<string>('search', {default: ''});
</script>

<template>
    <div class="flex flex-col gap-3">
        <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
                v-model="search"
                placeholder="Search events..."
                class="pl-9"
            />
        </div>

        <div class="flex flex-col sm:flex-row items-center gap-2">
            <div class="flex flex-wrap items-center gap-2">
                <EventTypeFilter v-model="eventType" />
                <ReadStatusFilter v-model="readStatus" />
                <EventCategoryFilter v-model="category" />
            </div>
            <div class="sm:ml-auto">
                <slot />
            </div>
        </div>
    </div>
</template>
