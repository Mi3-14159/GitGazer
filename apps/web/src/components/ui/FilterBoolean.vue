<script setup lang="ts">
    import Checkbox from '@/components/ui/Checkbox.vue';
    import Switch from '@/components/ui/Switch.vue';
    import type {Component} from 'vue';

    defineProps<{
        /** Human-readable label displayed next to the toggle. */
        label: string;
        /** Optional leading icon component (e.g. from lucide-vue-next). */
        icon?: Component;
        /** Visual variant: `'switch'` (default) renders a toggle switch, `'checkbox'` renders a checkbox. */
        variant?: 'switch' | 'checkbox';
    }>();

    const checked = defineModel<boolean>({required: true});
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
