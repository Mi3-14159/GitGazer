<script setup lang="ts">
    import type {Component} from 'vue';

    defineProps<{
        title?: string;
        description?: string;
        icon?: Component;
    }>();
</script>

<template>
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="flex items-center gap-2 min-w-0">
            <slot name="left" />
            <component
                :is="icon"
                v-if="icon"
                class="h-5 w-5 text-muted-foreground shrink-0"
            />
            <div v-if="title">
                <h2 class="text-lg font-semibold">
                    {{ title }}
                </h2>
                <p
                    v-if="description"
                    class="text-sm text-muted-foreground"
                >
                    {{ description }}
                </p>
            </div>
            <p
                v-else-if="description"
                class="text-sm text-muted-foreground"
            >
                {{ description }}
            </p>
        </div>
        <div class="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <slot />
        </div>
    </div>
</template>
