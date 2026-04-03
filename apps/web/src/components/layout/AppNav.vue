<script setup lang="ts">
    import {useTour} from '@/composables/useTour';
    import {Activity, Bell, LayoutDashboard, PlayCircle, ScrollText, Webhook} from 'lucide-vue-next';
    import {computed} from 'vue';
    import {RouterLink, useRoute} from 'vue-router';

    const route = useRoute();
    const {isActive: tourActive, currentStepConfig} = useTour();

    const tabs = [
        {value: 'overview', label: 'Overview', icon: Activity, path: '/overview'},
        {value: 'workflows', label: 'Workflows', icon: PlayCircle, path: '/workflows'},
        {value: 'integrations', label: 'Integrations', icon: Webhook, path: '/integrations'},
        {value: 'notifications', label: 'Notifications', icon: Bell, path: '/notifications'},
        {value: 'dashboards', label: 'Dashboards', icon: LayoutDashboard, path: '/dashboards'},
        {value: 'event-log', label: 'Event Log', icon: ScrollText, path: '/event-log'},
    ];

    const activeTab = computed(() => tabs.find((tab) => route.path.startsWith(tab.path))?.value ?? 'overview');

    const tourHighlightTab = computed(() => {
        if (!tourActive.value || !currentStepConfig.value?.route) return null;
        if (currentStepConfig.value.target === '[data-tour="nav-bar"]') return null;
        return tabs.find((tab) => tab.path === currentStepConfig.value?.route)?.value ?? null;
    });
</script>

<template>
    <div class="container mx-auto px-4 pt-2 pb-1">
        <nav
            data-tour="nav-bar"
            class="grid w-full grid-cols-6 rounded-lg bg-muted p-1"
        >
            <RouterLink
                v-for="tab in tabs"
                :key="tab.value"
                :to="tab.path"
                :class="[
                    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer no-underline',
                    activeTab === tab.value ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground',
                    tourHighlightTab === tab.value && 'tour-nav-highlight',
                ]"
            >
                <component
                    :is="tab.icon"
                    class="h-4 w-4"
                />
                <span class="hidden sm:inline">{{ tab.label }}</span>
            </RouterLink>
        </nav>
    </div>
</template>

<style scoped>
    .tour-nav-highlight {
        position: relative;
        z-index: 65;
        box-shadow:
            0 0 0 2px var(--primary),
            0 0 12px color-mix(in oklab, var(--primary) 40%, transparent);
        animation: tour-nav-pulse 2s ease-in-out infinite;
    }

    @keyframes tour-nav-pulse {
        0%,
        100% {
            box-shadow:
                0 0 0 2px var(--primary),
                0 0 12px color-mix(in oklab, var(--primary) 40%, transparent);
        }
        50% {
            box-shadow:
                0 0 0 2px var(--primary),
                0 0 20px color-mix(in oklab, var(--primary) 60%, transparent);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .tour-nav-highlight {
            animation: none;
        }
    }
</style>
