<script setup lang="ts">
    withDefaults(
        defineProps<{
            size?: 'sm' | 'md' | 'lg';
        }>(),
        {
            size: 'md',
        },
    );
</script>

<template>
    <img
        src="/logo.svg"
        alt="GitGazer logo"
        :class="[
            'block',
            {
                'h-8 w-8': size === 'sm',
                'h-11 w-11': size === 'md',
                'h-14 w-14': size === 'lg',
            },
        ]"
    />
</template>
