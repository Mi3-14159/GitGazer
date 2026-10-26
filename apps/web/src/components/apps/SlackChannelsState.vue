<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Skeleton from '@/components/ui/Skeleton.vue';
    import type {SlackChannel} from '@common/types';

    defineProps<{
        channels: SlackChannel[] | null;
        loading: boolean;
        error: string | null;
    }>();

    const emit = defineEmits<{
        retry: [];
    }>();

    defineSlots<{
        default(props: {channels: SlackChannel[]}): unknown;
    }>();
</script>

<template>
    <div
        v-if="loading"
        class="mt-5 space-y-2"
        aria-busy="true"
    >
        <Skeleton class="h-9 w-full" />
        <Skeleton class="h-9 w-full" />
        <Skeleton class="h-9 w-full" />
    </div>
    <div
        v-else-if="error"
        class="mt-5 flex flex-col items-start gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
    >
        <p
            role="alert"
            class="text-sm text-destructive"
        >
            {{ error }}
        </p>
        <Button
            variant="outline"
            size="sm"
            @click="emit('retry')"
        >
            Retry
        </Button>
    </div>
    <p
        v-else-if="channels?.length === 0"
        class="mt-5 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"
    >
        GitGazer sees no channels in this workspace yet.
    </p>
    <slot
        v-else-if="channels"
        :channels="channels"
    />
</template>
