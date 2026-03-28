<script setup lang="ts">
    import FilterDropdown from '@/components/ui/FilterDropdown.vue';
    import Input from '@/components/ui/Input.vue';
    import {READ_VALUES, type ReadFilter} from '@/composables/useEventLogFilters';
    import {FILTER_INJECTION_KEY} from '@/composables/useFilterRoot';
    import {EVENT_LOG_CATEGORIES, EVENT_LOG_TYPES, type EventLogCategory, type EventLogType} from '@common/types';
    import {Eye, Filter, Layers, Search} from 'lucide-vue-next';
    import {computed, provide} from 'vue';

    const props = defineProps<{
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

    // Writable computed refs that bridge v-model props ↔ FilterDropdown inject
    const typeRef = computed({
        get: () => props.type,
        set: (v: string) => emit('update:type', v as EventLogType | 'all'),
    });
    const readRef = computed({
        get: () => props.read,
        set: (v: string) => emit('update:read', v as ReadFilter),
    });
    const categoryRef = computed({
        get: () => props.category,
        set: (v: string) => emit('update:category', v as EventLogCategory | 'all'),
    });

    provide(FILTER_INJECTION_KEY, {type: typeRef, read: readRef, category: categoryRef});

    const typeOptions = [{value: 'all', label: 'All Types'}, ...toOptions(EVENT_LOG_TYPES)];
    const readOptions = toOptions(READ_VALUES);
    const categoryOptions = [{value: 'all', label: 'All Categories'}, ...toOptions(EVENT_LOG_CATEGORIES)];
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
                <FilterDropdown
                    filter-key="type"
                    :options="typeOptions"
                    :icon="Filter"
                    width-class="sm:w-[150px]"
                    label="Type"
                />
                <FilterDropdown
                    filter-key="read"
                    :options="readOptions"
                    :icon="Eye"
                    width-class="sm:w-[130px]"
                    label="Read status"
                />
                <FilterDropdown
                    filter-key="category"
                    :options="categoryOptions"
                    :icon="Layers"
                    width-class="sm:w-[170px]"
                    label="Category"
                />
            </div>
            <div class="sm:ml-auto">
                <slot />
            </div>
        </div>
    </div>
</template>
