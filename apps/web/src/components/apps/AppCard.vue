<script setup lang="ts">
    import AppIcon from '@/components/apps/AppIcon.vue';
    import type {AppInfo, AppStat} from '@/components/apps/appCatalog';
    import {cn} from '@/lib/utils';

    defineProps<{
        info: AppInfo;
        stats: AppStat[];
        selected: boolean;
        controls: string;
    }>();

    const emit = defineEmits<{
        select: [];
    }>();
</script>

<template>
    <button
        type="button"
        :aria-expanded="selected"
        :aria-controls="controls"
        :class="
            cn(
                'flex h-full w-full flex-col gap-3 rounded-xl border bg-card p-4 text-left text-card-foreground shadow-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected && ['bg-accent/40', info.tone.border],
            )
        "
        @click="emit('select')"
    >
        <span class="flex items-center gap-3">
            <AppIcon
                :icon="info.icon"
                :tone="info.tone.chip"
            />
            <span class="min-w-0">
                <span class="block font-semibold">{{ info.name }}</span>
                <span class="block text-sm text-muted-foreground">{{ info.description }}</span>
            </span>
        </span>
        <span class="flex w-full flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-sm text-muted-foreground">
            <span
                v-for="stat in stats"
                :key="`${stat.before}-${stat.after}`"
            >
                {{ stat.before }}
                <span class="font-semibold text-foreground">{{ stat.value }}</span>
                {{ stat.after }}
            </span>
        </span>
    </button>
</template>
