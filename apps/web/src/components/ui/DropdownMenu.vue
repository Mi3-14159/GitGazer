<script setup lang="ts">
    import {cn} from '@/lib/utils';
    import {DropdownMenuContent, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger} from 'radix-vue';
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
    <DropdownMenuRoot
        :open="open"
        @update:open="emit('update:open', $event)"
    >
        <DropdownMenuTrigger as-child>
            <slot name="trigger" />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
            <DropdownMenuContent
                :align="align ?? 'end'"
                :side-offset="4"
                :class="
                    cn(
                        'z-50 min-w-[8rem] overflow-hidden rounded-lg border bg-card p-1 shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
                        contentClass,
                    )
                "
            >
                <slot />
            </DropdownMenuContent>
        </DropdownMenuPortal>
    </DropdownMenuRoot>
</template>
