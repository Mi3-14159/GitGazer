<script setup lang="ts">
    import {inject, onMounted, watch, type InjectionKey, type Ref} from 'vue';

    defineOptions({name: 'AutoExpandGroups'});

    const props = defineProps<{groupIds: string[]}>();

    type VDataTableGroupContext = {
        opened: Ref<Set<string>>;
    };

    const VDataTableGroupSymbol = Symbol.for('vuetify:data-table-group') as InjectionKey<VDataTableGroupContext>;

    const group = inject(VDataTableGroupSymbol, null);

    const maybeOpenAll = () => {
        if (!group) return;
        if (group.opened.value.size > 0) return;
        if (props.groupIds.length === 0) return;
        group.opened.value = new Set(props.groupIds);
    };

    onMounted(maybeOpenAll);
    watch(
        () => props.groupIds,
        () => maybeOpenAll(),
        {immediate: true},
    );
</script>

<template></template>
