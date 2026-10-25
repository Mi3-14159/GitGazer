<script setup lang="ts">
    import type {Component} from 'vue';

    defineProps<{icon: Component}>();
</script>

<template>
    <span
        class="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-foreground"
        aria-hidden="true"
    >
        <component
            :is="icon"
            class="size-5"
        />
    </span>
</template>
