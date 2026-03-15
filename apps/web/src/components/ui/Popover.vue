<script setup lang="ts">
    import {cn} from '@/lib/utils';
    import {PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger} from 'radix-vue';
    import {type HTMLAttributes} from 'vue';

    defineProps<{
        open?: boolean;
        align?: 'start' | 'center' | 'end';
        contentClass?: HTMLAttributes['class'];
    }>();

    const emit = defineEmits<{
        'update:open': [value: boolean];
    }>();
</script>

<template>
    <PopoverRoot
        :open="open"
        @update:open="emit('update:open', $event)"
    >
        <PopoverTrigger as-child>
            <slot name="trigger" />
        </PopoverTrigger>
        <PopoverPortal>
            <PopoverContent
                :align="align ?? 'center'"
                :side-offset="4"
                :class="
                    cn(
                        'z-50 w-56 rounded-lg border bg-card p-2 shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
                        contentClass,
                    )
                "
            >
                <slot />
            </PopoverContent>
        </PopoverPortal>
    </PopoverRoot>
</template>
