<script setup lang="ts">
    import {cn} from '@/lib/utils';
    import {cva, type VariantProps} from 'class-variance-authority';
    import {computed, type HTMLAttributes} from 'vue';

    const badgeVariants = cva(
        'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring',
        {
            variants: {
                variant: {
                    default: 'border-transparent bg-primary text-primary-foreground',
                    secondary: 'border-transparent bg-secondary text-secondary-foreground',
                    destructive: 'border-transparent bg-destructive text-destructive-foreground',
                    outline: 'text-foreground',
                    success: 'border-transparent bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
                    warning: 'border-transparent bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
                },
            },
            defaultVariants: {
                variant: 'default',
            },
        },
    );

    type BadgeVariantProps = VariantProps<typeof badgeVariants>;

    const props = defineProps<{
        variant?: NonNullable<BadgeVariantProps['variant']>;
        class?: HTMLAttributes['class'];
    }>();

    const classes = computed(() => cn(badgeVariants({variant: props.variant}), props.class));
</script>

<template>
    <div :class="classes">
        <slot />
    </div>
</template>
