<script setup lang="ts">
    import {cn} from '@/lib/utils';
    import {TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger} from 'radix-vue';
    import {type HTMLAttributes} from 'vue';

    defineProps<{
        contentClass?: HTMLAttributes['class'];
        side?: 'top' | 'right' | 'bottom' | 'left';
        delayDuration?: number;
    }>();
</script>

<template>
    <TooltipProvider :delay-duration="delayDuration ?? 300">
        <TooltipRoot>
            <TooltipTrigger as-child>
                <slot name="trigger" />
            </TooltipTrigger>
            <TooltipPortal>
                <TooltipContent
                    :side="side ?? 'top'"
                    :side-offset="6"
                    :class="
                        cn(
                            'z-50 max-w-xs rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95',
                            contentClass,
                        )
                    "
                >
                    <slot />
                </TooltipContent>
            </TooltipPortal>
        </TooltipRoot>
    </TooltipProvider>
</template>
