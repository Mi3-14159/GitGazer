<script setup lang="ts">
    import {cn} from '@/lib/utils';
    import {type HTMLAttributes, computed} from 'vue';

    const props = defineProps<{
        class?: HTMLAttributes['class'];
        modelValue?: boolean;
        disabled?: boolean;
    }>();

    const emit = defineEmits<{
        'update:modelValue': [value: boolean];
    }>();

    const isChecked = computed(() => props.modelValue ?? false);

    function toggle() {
        if (props.disabled) return;
        emit('update:modelValue', !isChecked.value);
    }
</script>

<template>
    <button
        role="switch"
        type="button"
        :aria-checked="isChecked"
        :disabled="disabled"
        :class="
            cn(
                'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                isChecked ? 'bg-primary' : 'bg-switch-background',
                props.class,
            )
        "
        @click="toggle"
    >
        <span
            :class="
                cn(
                    'pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform',
                    isChecked ? 'translate-x-4' : 'translate-x-0',
                )
            "
        />
    </button>
</template>
