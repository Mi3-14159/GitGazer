<script setup lang="ts">
    import AppIcon from '@/components/apps/AppIcon.vue';
    import {APP_INFO, COMING_LATER} from '@/components/apps/appCatalog';
    import Badge from '@/components/ui/Badge.vue';
    import Button from '@/components/ui/Button.vue';
    import {cn} from '@/lib/utils';
    import type {IntegrationAppType} from '@common/types';

    defineProps<{
        installable: IntegrationAppType[];
        canInstall: boolean;
        installing: IntegrationAppType | null;
    }>();

    const emit = defineEmits<{
        install: [type: IntegrationAppType];
    }>();
</script>

<template>
    <section aria-labelledby="apps-available-heading">
        <h2
            id="apps-available-heading"
            class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
            Available
        </h2>
        <ul class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <li
                v-for="type in installable"
                :key="type"
                class="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm"
            >
                <AppIcon
                    :icon="APP_INFO[type].icon"
                    :tone="APP_INFO[type].tone.chip"
                />
                <div class="min-w-0 flex-1">
                    <h3 class="font-semibold">{{ APP_INFO[type].name }}</h3>
                    <p class="text-sm text-muted-foreground">{{ APP_INFO[type].description }}</p>
                </div>
                <Button
                    v-if="canInstall"
                    size="sm"
                    variant="outline"
                    class="shrink-0"
                    :loading="installing === type"
                    :disabled="installing !== null"
                    :aria-label="`Install ${APP_INFO[type].name}`"
                    @click="emit('install', type)"
                >
                    Install
                </Button>
            </li>
            <li
                v-for="app in COMING_LATER"
                :key="app.name"
                :class="cn('flex items-center gap-3 rounded-xl border border-dashed p-4', app.tone.border)"
            >
                <AppIcon
                    :icon="app.icon"
                    :tone="app.tone.chip"
                />
                <div class="min-w-0 flex-1">
                    <h3 class="font-semibold text-muted-foreground">{{ app.name }}</h3>
                    <p class="text-sm text-muted-foreground">{{ app.description }}</p>
                </div>
                <Badge
                    variant="secondary"
                    :class="cn('shrink-0 font-medium', app.tone.chip)"
                >
                    Coming later
                </Badge>
            </li>
        </ul>
    </section>
</template>
