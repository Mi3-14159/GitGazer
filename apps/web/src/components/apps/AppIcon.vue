<script setup lang="ts">
    import {cn} from '@/lib/utils';
    import type {Component} from 'vue';

    defineProps<{icon: Component; tone?: string}>();
</script>

<template>
    <span
        :class="cn('grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-foreground', tone)"
        aria-hidden="true"
    >
        <component
            :is="icon"
            class="size-5"
        />
    </span>
</template>
