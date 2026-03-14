<script setup lang="ts">
    import {cn} from '@/lib/utils';
    import {type HTMLAttributes} from 'vue';

    const props = withDefaults(
        defineProps<{
            class?: HTMLAttributes['class'];
            modelValue?: string;
            placeholder?: string;
            disabled?: boolean;
            rows?: number;
        }>(),
        {rows: 3},
    );

    const emit = defineEmits<{
        'update:modelValue': [value: string];
    }>();

    function onInput(event: Event) {
        emit('update:modelValue', (event.target as HTMLTextAreaElement).value);
    }
</script>

<template>
    <textarea
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :rows="rows"
        :class="
            cn(
                'flex min-h-[60px] w-full rounded-lg border border-border bg-input-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                props.class,
            )
        "
        @input="onInput"
    />
</template>
