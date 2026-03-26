<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Input from '@/components/ui/Input.vue';
    import type {EventLogType} from '@common/types';
    import {CheckCheck, Filter, Search} from 'lucide-vue-next';
    import {ref, watch} from 'vue';

    type FilterType = 'all' | 'unread' | 'read' | EventLogType;

    const props = defineProps<{
        unreadCount: number;
    }>();

    const emit = defineEmits<{
        filterChange: [filter: {type?: EventLogType; read?: boolean; search?: string}];
        markAllRead: [];
    }>();

    const searchTerm = ref('');
    const filterType = ref<FilterType>('all');

    const filterOptions: {value: FilterType; label: string}[] = [
        {value: 'all', label: 'All Events'},
        {value: 'unread', label: 'Unread Only'},
        {value: 'read', label: 'Read Only'},
        {value: 'failure', label: 'Failures'},
        {value: 'success', label: 'Successes'},
        {value: 'warning', label: 'Warnings'},
    ];

    function emitFilters() {
        const filter: {type?: EventLogType; read?: boolean; search?: string} = {};

        if (filterType.value === 'unread') filter.read = false;
        else if (filterType.value === 'read') filter.read = true;
        else if (filterType.value !== 'all') filter.type = filterType.value;

        if (searchTerm.value.trim()) filter.search = searchTerm.value.trim();

        emit('filterChange', filter);
    }

    let debounceTimer: ReturnType<typeof globalThis.setTimeout>;

    watch(searchTerm, () => {
        clearTimeout(debounceTimer);
        debounceTimer = globalThis.setTimeout(emitFilters, 300);
    });

    watch(filterType, emitFilters);
</script>

<template>
    <div class="flex flex-col sm:flex-row gap-3">
        <div class="relative flex-1">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
                v-model="searchTerm"
                placeholder="Search events..."
                class="pl-9"
            />
        </div>

        <div class="flex items-center gap-2">
            <div class="relative">
                <Filter class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <select
                    v-model="filterType"
                    class="flex h-9 w-full sm:w-[180px] rounded-lg border border-border bg-input-background pl-9 pr-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring appearance-none cursor-pointer"
                >
                    <option
                        v-for="opt in filterOptions"
                        :key="opt.value"
                        :value="opt.value"
                    >
                        {{ opt.label }}
                    </option>
                </select>
            </div>

            <Button
                variant="outline"
                size="sm"
                :disabled="props.unreadCount === 0"
                @click="emit('markAllRead')"
            >
                <CheckCheck class="h-4 w-4 mr-2" />
                Mark All as Read
            </Button>
        </div>
    </div>
</template>
