<script setup lang="ts">
    import Checkbox from '@/components/ui/Checkbox.vue';
    import Switch from '@/components/ui/Switch.vue';
    import {FILTER_INJECTION_KEY} from '@/composables/useFilterRoot';
    import {inject, type Component, type Ref} from 'vue';

    const props = defineProps<{
        /** Key matching a boolean filter name in the parent `<FilterRoot>` schema. */
        filterKey: string;
        /** Human-readable label displayed next to the toggle. */
        label: string;
        /** Optional leading icon component (e.g. from lucide-vue-next). */
        icon?: Component;
        /** Visual variant: `'switch'` (default) renders a toggle switch, `'checkbox'` renders a checkbox. */
        variant?: 'switch' | 'checkbox';
    }>();

    const filters = inject(FILTER_INJECTION_KEY);
    if (!filters) {
        throw new Error('FilterBoolean requires a parent that provides FILTER_INJECTION_KEY (e.g. <FilterRoot> or a manual provide)');
    }

    const checked = filters[props.filterKey] as Ref<boolean> | undefined;
    if (!checked) {
        throw new Error(`FilterBoolean: filter key "${props.filterKey}" not found in parent FilterRoot schema`);
    }
</script>

<template>
    <label class="flex items-center gap-1.5 cursor-pointer">
        <Checkbox
            v-if="variant === 'checkbox'"
            v-model="checked"
        />
        <Switch
            v-else
            v-model="checked"
        />
        <component
            v-if="icon"
            :is="icon"
            class="h-3.5 w-3.5 text-muted-foreground"
        />
        <span class="text-sm text-muted-foreground whitespace-nowrap">{{ label }}</span>
    </label>
</template>
