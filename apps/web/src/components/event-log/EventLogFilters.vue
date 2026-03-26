<script setup lang="ts">
    import Input from '@/components/ui/Input.vue';
    import {READ_VALUES, type ReadFilter} from '@/composables/useEventLogFilters';
    import {EVENT_LOG_CATEGORIES, EVENT_LOG_TYPES, type EventLogCategory, type EventLogType} from '@common/types';
    import {Eye, Filter, Layers, Search} from 'lucide-vue-next';
    import type {Component} from 'vue';

    defineProps<{
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
    }>();

    function capitalize(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    function toOptions<T extends string>(values: readonly T[]): {value: T; label: string}[] {
        return values.map((v) => ({value: v, label: capitalize(v)}));
    }

    type FilterProp = 'type' | 'read' | 'category';

    function onFilterChange(prop: FilterProp, event: Event) {
        const value = (event.target as HTMLSelectElement).value;
        if (prop === 'type') emit('update:type', value as EventLogType | 'all');
        else if (prop === 'read') emit('update:read', value as ReadFilter);
        else emit('update:category', value as EventLogCategory | 'all');
    }

    const filters: {icon: Component; prop: FilterProp; options: {value: string; label: string}[]; width: string}[] = [
        {icon: Filter, prop: 'type', options: [{value: 'all', label: 'All Types'}, ...toOptions(EVENT_LOG_TYPES)], width: 'sm:w-[150px]'},
        {icon: Eye, prop: 'read', options: toOptions(READ_VALUES), width: 'sm:w-[130px]'},
        {
            icon: Layers,
            prop: 'category',
            options: [{value: 'all', label: 'All Categories'}, ...toOptions(EVENT_LOG_CATEGORIES)],
            width: 'sm:w-[170px]',
        },
    ];
</script>

<template>
    <div class="flex flex-col gap-3">
        <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
                :model-value="search"
                placeholder="Search events..."
                class="pl-9"
                @update:model-value="emit('update:search', $event as string)"
            />
        </div>

        <div class="flex flex-col sm:flex-row items-center gap-2">
            <div class="flex flex-wrap items-center gap-2">
                <div
                    v-for="filter in filters"
                    :key="filter.prop"
                    class="relative"
                >
                    <component
                        :is="filter.icon"
                        class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
                    />
                    <select
                        :value="$props[filter.prop]"
                        :class="[
                            'flex h-9 w-full rounded-lg border border-border bg-input-background pl-9 pr-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring appearance-none cursor-pointer',
                            filter.width,
                        ]"
                        @change="onFilterChange(filter.prop, $event)"
                    >
                        <option
                            v-for="opt in filter.options"
                            :key="opt.value"
                            :value="opt.value"
                        >
                            {{ opt.label }}
                        </option>
                    </select>
                </div>
            </div>
            <div class="sm:ml-auto">
                <slot />
            </div>
        </div>
    </div>
</template>
