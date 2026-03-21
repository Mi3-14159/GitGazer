<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import type {Component} from 'vue';

    defineProps<{
        icon: Component;
        message: string;
        actionLabel?: string;
    }>();

    const emit = defineEmits<{
        action: [];
    }>();
</script>

<template>
    <div class="rounded-xl border bg-card p-8 text-center">
        <component
            :is="icon"
            class="mx-auto h-10 w-10 text-muted-foreground/40"
        />
        <p class="mt-2 text-sm text-muted-foreground">{{ message }}</p>
        <Button
            v-if="actionLabel"
            size="sm"
            class="mt-4"
            @click="emit('action')"
        >
            {{ actionLabel }}
        </Button>
    </div>
</template>
