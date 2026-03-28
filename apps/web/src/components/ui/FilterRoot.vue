<script setup lang="ts" generic="S extends Record<string, FilterDef<any>>">
    import {FILTER_INJECTION_KEY} from '@/composables/useFilterRoot';
    import {useUrlFilters, type FilterDef} from '@/composables/useUrlFilters';
    import {provide, reactive, watch, type Ref} from 'vue';

    const props = defineProps<{
        schema: S;
    }>();

    const emit = defineEmits<{
        change: [values: Record<string, unknown>];
    }>();

    const filters = useUrlFilters(props.schema);

    // Reactive wrapper auto-unwraps refs for scoped-slot use.
    // Read:  `values.someFilter` → plain value (auto-unwrapped).
    // Write: `values.someFilter = newVal` → sets the underlying ref.
    const values = reactive(filters);

    provide(FILTER_INJECTION_KEY, filters);

    watch(
        Object.values(filters),
        () => {
            const snapshot: Record<string, unknown> = {};
            for (const [key, r] of Object.entries(filters)) {
                snapshot[key] = (r as Ref).value;
            }
            emit('change', snapshot);
        },
        {deep: true, flush: 'post'},
    );

    /** Reset all filters to their schema defaults. */
    function reset() {
        for (const [name, def] of Object.entries(props.schema)) {
            (filters[name] as Ref).value = structuredClone(def.defaultValue);
        }
    }

    defineExpose({...filters, reset});
</script>

<template>
    <slot
        :values="values"
        :reset="reset"
    />
</template>
