<script setup lang="ts">
    import {cn} from '@/lib/utils';
    import {cva, type VariantProps} from 'class-variance-authority';
    import {computed, type HTMLAttributes} from 'vue';

    const buttonVariants = cva(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
        {
            variants: {
                variant: {
                    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
                    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
                    outline: 'border border-border bg-background hover:bg-accent hover:text-accent-foreground',
                    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
                    ghost: 'hover:bg-accent hover:text-accent-foreground',
                    link: 'text-primary underline-offset-4 hover:underline',
                },
                size: {
                    default: 'h-9 px-4 py-2',
                    sm: 'h-8 rounded-md px-3 text-xs',
                    lg: 'h-10 rounded-lg px-8',
                    icon: 'h-9 w-9',
                },
            },
            defaultVariants: {
                variant: 'default',
                size: 'default',
            },
        },
    );

    type ButtonVariantProps = VariantProps<typeof buttonVariants>;

    const props = withDefaults(
        defineProps<{
            variant?: NonNullable<ButtonVariantProps['variant']>;
            size?: NonNullable<ButtonVariantProps['size']>;
            class?: HTMLAttributes['class'];
            disabled?: boolean;
            type?: 'button' | 'submit' | 'reset';
        }>(),
        {variant: 'default', size: 'default', type: 'button'},
    );

    const classes = computed(() => cn(buttonVariants({variant: props.variant, size: props.size}), props.class));
</script>

<template>
    <button
        :class="classes"
        :disabled="disabled"
        :type="type"
    >
        <slot />
    </button>
</template>
