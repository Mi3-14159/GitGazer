<script setup lang="ts">
    import {cn} from '@/lib/utils';
    import {Check} from 'lucide-vue-next';
    import {type HTMLAttributes, computed} from 'vue';

    const props = defineProps<{
        class?: HTMLAttributes['class'];
        modelValue?: boolean;
        disabled?: boolean;
        id?: string;
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
        type="button"
        role="checkbox"
        :id="id"
        :aria-checked="isChecked"
        :disabled="disabled"
        :class="
            cn(
                'peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                isChecked ? 'bg-primary text-primary-foreground' : 'bg-background',
                props.class,
            )
        "
        @click="toggle"
    >
        <span
            v-if="isChecked"
            class="flex items-center justify-center"
        >
            <Check class="h-3 w-3" />
        </span>
    </button>
</template>
