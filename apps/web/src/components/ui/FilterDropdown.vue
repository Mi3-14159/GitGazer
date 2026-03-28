<script setup lang="ts">
    import Popover from '@/components/ui/Popover.vue';
    import SearchableCheckboxList from '@/components/ui/SearchableCheckboxList.vue';
    import {FILTER_INJECTION_KEY} from '@/composables/useFilterRoot';
    import {ChevronDown} from 'lucide-vue-next';
    import {computed, inject, ref, type Component, type Ref} from 'vue';

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
        /** Enable multi-select mode (Popover + SearchableCheckboxList). */
        multiple?: boolean;
        /** Placeholder text shown when no values are selected (multi-select only). */
        placeholder?: string;
        /** Placeholder for the search input inside the popover (multi-select only). */
        searchPlaceholder?: string;
    }>();

    const filters = inject(FILTER_INJECTION_KEY);
    if (!filters) {
        throw new Error('FilterDropdown requires a parent that provides FILTER_INJECTION_KEY (e.g. <FilterRoot> or a manual provide)');
    }

    const maybeRef = filters[props.filterKey] as Ref<string> | Ref<string[]> | undefined;
    if (!maybeRef) {
        throw new Error(`FilterDropdown: filter key "${props.filterKey}" not found in parent FilterRoot schema`);
    }

    // --- Single-select mode ---
    const singleRef = props.multiple ? undefined : (maybeRef as Ref<string>);

    function onChange(event: Event) {
        if (!singleRef) return;
        singleRef.value = (event.target as HTMLSelectElement).value;
    }

    // --- Multi-select mode ---
    const multiRef = props.multiple ? (maybeRef as Ref<string[]>) : undefined;
    const popoverOpen = ref(false);

    function toggleValue(value: string) {
        if (!multiRef) return;
        const current = [...multiRef.value];
        const idx = current.indexOf(value);
        if (idx >= 0) current.splice(idx, 1);
        else current.push(value);
        multiRef.value = current;
    }

    function clearAll() {
        if (!multiRef) return;
        multiRef.value = [];
    }

    const buttonLabel = computed(() => {
        if (!multiRef) return '';
        const selected = multiRef.value;
        if (!selected.length) return props.placeholder ?? props.label ?? props.filterKey;
        if (selected.length <= 2) {
            return selected.map((v) => props.options.find((o) => o.value === v)?.label ?? v).join(', ');
        }
        return `${selected.length} selected`;
    });

    const hasSelection = computed(() => !!multiRef && multiRef.value.length > 0);

    const baseClasses =
        'flex h-9 w-full rounded-lg border border-border bg-input-background pr-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring appearance-none cursor-pointer';
</script>

<template>
    <!-- Single-select: native <select> -->
    <div
        v-if="!multiple"
        class="relative"
    >
        <component
            v-if="icon"
            :is="icon"
            class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
        />
        <select
            :value="singleRef"
            :aria-label="label ?? filterKey"
            :class="[baseClasses, icon ? 'pl-9' : 'pl-3', widthClass]"
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

    <!-- Multi-select: Popover + SearchableCheckboxList -->
    <Popover
        v-else
        :open="popoverOpen"
        align="start"
        content-class="w-64"
        @update:open="popoverOpen = $event"
    >
        <template #trigger>
            <button
                type="button"
                :aria-label="label ?? filterKey"
                :class="[baseClasses, 'items-center gap-1.5 text-left', icon ? 'pl-9' : 'pl-3', hasSelection ? 'border-primary' : '', widthClass]"
                class="relative"
            >
                <component
                    v-if="icon"
                    :is="icon"
                    class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
                />
                <span class="flex-1 truncate">{{ buttonLabel }}</span>
                <ChevronDown class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
        </template>
        <SearchableCheckboxList
            :options="options"
            :selected="multiRef ?? []"
            :placeholder="searchPlaceholder"
            @toggle="toggleValue"
            @clear="clearAll"
        />
    </Popover>
</template>
