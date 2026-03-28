<script setup lang="ts">
    import {FILTER_INJECTION_KEY} from '@/composables/useFilterRoot';
    import {inject, type Component, type Ref} from 'vue';

    const props = defineProps<{
        /** Key matching a filter name in the parent `<FilterRoot>` schema. */
        filterKey: string;
        /** Selectable options. */
        options: {value: string; label: string}[];
        /** Optional leading icon component (e.g. from lucide-vue-next). */
        icon?: Component;
        /** Optional width class (e.g. `'sm:w-[150px]'`). Applied alongside the base classes. */
        widthClass?: string;
        /** Accessible label for the select. Falls back to filterKey if not provided. */
        label?: string;
    }>();

    const filters = inject(FILTER_INJECTION_KEY);
    if (!filters) {
        throw new Error('FilterDropdown must be used inside a <FilterRoot> component');
    }

    // Dropdown <select> values are always strings — this component is designed for
    // string-based filters (enumFilter, stringFilter). For other types, use a
    // custom filter component.
    const filterRef = filters[props.filterKey] as Ref<string> | undefined;
    if (!filterRef) {
        throw new Error(`FilterDropdown: filter key "${props.filterKey}" not found in parent FilterRoot schema`);
    }

    function onChange(event: Event) {
        filterRef!.value = (event.target as HTMLSelectElement).value;
    }
</script>

<template>
    <div class="relative">
        <component
            v-if="icon"
            :is="icon"
            class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
        />
        <select
            :value="filterRef"
            :aria-label="label ?? filterKey"
            :class="[
                'flex h-9 w-full rounded-lg border border-border bg-input-background pr-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring appearance-none cursor-pointer',
                icon ? 'pl-9' : 'pl-3',
                widthClass,
            ]"
            @change="onChange"
        >
            <option
                v-for="opt in options"
                :key="opt.value"
                :value="opt.value"
            >
                {{ opt.label }}
            </option>
        </select>
    </div>
</template>
