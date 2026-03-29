<script setup lang="ts" generic="T extends string | string[]">
    import Popover from '@/components/ui/Popover.vue';
    import SearchableCheckboxList from '@/components/ui/SearchableCheckboxList.vue';
    import {ChevronDown} from 'lucide-vue-next';
    import {computed, ref, type Component} from 'vue';

    const props = defineProps<{
        /** Selectable options. */
        options: {value: string; label: string}[];
        /** Optional leading icon component (e.g. from lucide-vue-next). */
        icon?: Component;
        /** Optional width class (e.g. `'sm:w-[150px]'`). Applied alongside the base classes. */
        widthClass?: string;
        /** Accessible label for the select. */
        label?: string;
        /** Enable multi-select mode (Popover + SearchableCheckboxList). */
        multiple?: boolean;
        /** Placeholder text shown when no values are selected (multi-select only). */
        placeholder?: string;
        /** Placeholder for the search input inside the popover (multi-select only). */
        searchPlaceholder?: string;
    }>();

    const model = defineModel<T>({required: true});

    // --- Single-select mode ---
    function onChange(event: Event) {
        model.value = (event.target as HTMLSelectElement).value as T;
    }

    // --- Multi-select mode ---
    const popoverOpen = ref(false);

    function toggleValue(value: string) {
        const current = [...(model.value as string[])];
        const idx = current.indexOf(value);
        if (idx >= 0) current.splice(idx, 1);
        else current.push(value);
        model.value = current as T;
    }

    function clearAll() {
        model.value = [] as unknown as T;
    }

    const buttonLabel = computed(() => {
        if (!props.multiple) return '';
        const selected = model.value as string[];
        if (!selected.length) return props.placeholder ?? props.label ?? '';
        if (selected.length <= 2) {
            return selected.map((v) => props.options.find((o) => o.value === v)?.label ?? v).join(', ');
        }
        return `${selected.length} selected`;
    });

    const hasSelection = computed(() => props.multiple && (model.value as string[]).length > 0);

    const baseClasses =
        'flex h-9 rounded-lg border border-border bg-input-background pr-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring appearance-none cursor-pointer';
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
            :value="model"
            :aria-label="label"
            :class="[baseClasses, 'w-full', icon ? 'pl-9' : 'pl-3', widthClass]"
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
                :aria-label="label"
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
            :selected="model as string[]"
            :placeholder="searchPlaceholder"
            @toggle="toggleValue"
            @clear="clearAll"
        />
    </Popover>
</template>
