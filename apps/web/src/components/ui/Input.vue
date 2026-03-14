<script setup lang="ts">
    import {cn} from '@/lib/utils';
    import {type HTMLAttributes} from 'vue';

    const props = withDefaults(
        defineProps<{
            class?: HTMLAttributes['class'];
            modelValue?: string;
            type?: string;
            placeholder?: string;
            disabled?: boolean;
            readonly?: boolean;
        }>(),
        {type: 'text'},
    );

    const emit = defineEmits<{
        'update:modelValue': [value: string];
    }>();

    function onInput(event: Event) {
        emit('update:modelValue', (event.target as HTMLInputElement).value);
    }
</script>

<template>
    <input
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        :class="
            cn(
                'flex h-9 w-full rounded-lg border border-border bg-input-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                props.class,
            )
        "
        @input="onInput"
    />
</template>
