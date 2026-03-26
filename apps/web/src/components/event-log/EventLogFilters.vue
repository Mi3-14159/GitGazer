<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Input from '@/components/ui/Input.vue';
    import type {EventLogCategory, EventLogType} from '@common/types';
    import {CheckCheck, Filter, Layers, Search, Tag} from 'lucide-vue-next';
    import {ref, watch} from 'vue';

    type ReadFilter = 'all' | 'unread' | 'read';

    const props = defineProps<{
        unreadCount: number;
    }>();

    const emit = defineEmits<{
        filterChange: [filter: {type?: EventLogType; category?: EventLogCategory; read?: boolean; search?: string}];
        markAllRead: [];
    }>();

    const searchTerm = ref('');
    const typeFilter = ref<EventLogType | 'all'>('all');
    const readFilter = ref<ReadFilter>('all');
    const categoryFilter = ref<EventLogCategory | 'all'>('all');

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

    function emitFilters() {
        const filter: {type?: EventLogType; category?: EventLogCategory; read?: boolean; search?: string} = {};

        if (typeFilter.value !== 'all') filter.type = typeFilter.value;
        if (readFilter.value === 'unread') filter.read = false;
        else if (readFilter.value === 'read') filter.read = true;
        if (categoryFilter.value !== 'all') filter.category = categoryFilter.value;
        if (searchTerm.value.trim()) filter.search = searchTerm.value.trim();

        emit('filterChange', filter);
    }

    let debounceTimer: ReturnType<typeof globalThis.setTimeout>;

    watch(searchTerm, () => {
        clearTimeout(debounceTimer);
        debounceTimer = globalThis.setTimeout(emitFilters, 300);
    });

    watch([typeFilter, readFilter, categoryFilter], emitFilters);
</script>

<template>
    <div class="flex flex-col gap-3">
        <div class="flex flex-col sm:flex-row gap-3">
            <div class="relative flex-1">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    v-model="searchTerm"
                    placeholder="Search events..."
                    class="pl-9"
                />
            </div>

            <Button
                variant="outline"
                size="sm"
                class="h-9"
                :disabled="props.unreadCount === 0"
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
                    v-model="typeFilter"
                    class="flex h-9 w-full sm:w-[150px] rounded-lg border border-border bg-input-background pl-9 pr-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring appearance-none cursor-pointer"
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
                <Tag class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <select
                    v-model="readFilter"
                    class="flex h-9 w-full sm:w-[130px] rounded-lg border border-border bg-input-background pl-9 pr-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring appearance-none cursor-pointer"
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
                    v-model="categoryFilter"
                    class="flex h-9 w-full sm:w-[170px] rounded-lg border border-border bg-input-background pl-9 pr-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring appearance-none cursor-pointer"
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
