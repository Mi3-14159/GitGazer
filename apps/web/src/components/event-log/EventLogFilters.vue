<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Input from '@/components/ui/Input.vue';
    import type {ReadFilter} from '@/composables/useEventLogFilters';
    import type {EventLogCategory, EventLogType} from '@common/types';
    import {CheckCheck, Eye, Filter, Layers, Search} from 'lucide-vue-next';

    defineProps<{
        unreadCount: number;
        type: EventLogType | 'all';
        read: ReadFilter;
        category: EventLogCategory | 'all';
        search: string;
    }>();

    const emit = defineEmits<{
        'update:type': [value: EventLogType | 'all'];
        'update:read': [value: ReadFilter];
        'update:category': [value: EventLogCategory | 'all'];
        'update:search': [value: string];
        markAllRead: [];
    }>();

    const typeOptions: {value: EventLogType | 'all'; label: string}[] = [
        {value: 'all', label: 'All Types'},
        {value: 'failure', label: 'Failures'},
        {value: 'success', label: 'Successes'},
        {value: 'warning', label: 'Warnings'},
        {value: 'info', label: 'Info'},
        {value: 'alert', label: 'Alerts'},
    ];

    const readOptions: {value: ReadFilter; label: string}[] = [
        {value: 'all', label: 'All'},
        {value: 'unread', label: 'Unread'},
        {value: 'read', label: 'Read'},
    ];

    const categoryOptions: {value: EventLogCategory | 'all'; label: string}[] = [
        {value: 'all', label: 'All Categories'},
        {value: 'system', label: 'System'},
        {value: 'notification', label: 'Notification'},
    ];
</script>

<template>
    <div class="flex flex-col gap-3">
        <div class="flex flex-col sm:flex-row gap-3">
            <div class="relative flex-1">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    :model-value="search"
                    placeholder="Search events..."
                    class="pl-9"
                    @update:model-value="emit('update:search', $event as string)"
                />
            </div>

            <Button
                variant="outline"
                size="sm"
                class="h-9"
                :disabled="unreadCount === 0"
                @click="emit('markAllRead')"
            >
                <CheckCheck class="h-4 w-4 mr-2" />
                Mark All as Read
            </Button>
        </div>

        <div class="flex flex-wrap items-center gap-2">
            <!-- Type Filter -->
            <div class="relative">
                <Filter class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <select
                    :value="type"
                    class="flex h-9 w-full sm:w-[150px] rounded-lg border border-border bg-input-background pl-9 pr-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring appearance-none cursor-pointer"
                    @change="emit('update:type', ($event.target as HTMLSelectElement).value as EventLogType | 'all')"
                >
                    <option
                        v-for="opt in typeOptions"
                        :key="opt.value"
                        :value="opt.value"
                    >
                        {{ opt.label }}
                    </option>
                </select>
            </div>

            <!-- Read Filter -->
            <div class="relative">
                <Eye class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <select
                    :value="read"
                    class="flex h-9 w-full sm:w-[130px] rounded-lg border border-border bg-input-background pl-9 pr-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring appearance-none cursor-pointer"
                    @change="emit('update:read', ($event.target as HTMLSelectElement).value as ReadFilter)"
                >
                    <option
                        v-for="opt in readOptions"
                        :key="opt.value"
                        :value="opt.value"
                    >
                        {{ opt.label }}
                    </option>
                </select>
            </div>

            <!-- Category Filter -->
            <div class="relative">
                <Layers class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <select
                    :value="category"
                    class="flex h-9 w-full sm:w-[170px] rounded-lg border border-border bg-input-background pl-9 pr-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring appearance-none cursor-pointer"
                    @change="emit('update:category', ($event.target as HTMLSelectElement).value as EventLogCategory | 'all')"
                >
                    <option
                        v-for="opt in categoryOptions"
                        :key="opt.value"
                        :value="opt.value"
                    >
                        {{ opt.label }}
                    </option>
                </select>
            </div>
        </div>
    </div>
</template>
