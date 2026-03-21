<script setup lang="ts">
    import {Activity, Bell, LayoutDashboard, PlayCircle, Webhook} from 'lucide-vue-next';
    import {computed} from 'vue';
    import {useRoute, useRouter} from 'vue-router';

    const route = useRoute();
    const router = useRouter();

    const tabs = [
        {value: 'overview', label: 'Overview', icon: Activity, path: '/overview'},
        {value: 'workflows', label: 'Workflows', icon: PlayCircle, path: '/workflows'},
        {value: 'integrations', label: 'Integrations', icon: Webhook, path: '/integrations'},
        {value: 'notifications', label: 'Notifications', icon: Bell, path: '/notifications'},
        {value: 'dashboards', label: 'Dashboards', icon: LayoutDashboard, path: '/dashboards'},
    ];

    const activeTab = computed(() => {
        const path = route.path;
        if (path.startsWith('/overview')) return 'overview';
        if (path.startsWith('/dashboards')) return 'dashboards';
        if (path.startsWith('/workflows')) return 'workflows';
        if (path.startsWith('/integrations')) return 'integrations';
        if (path.startsWith('/notifications')) return 'notifications';
        return 'overview';
    });

    function navigateTab(tab: (typeof tabs)[number]) {
        if (route.path === tab.path) return;
        router.push(tab.path);
    }
</script>

<template>
    <div class="container mx-auto px-4 pt-2 pb-1">
        <nav class="grid w-full grid-cols-5 rounded-lg bg-muted p-1">
            <button
                v-for="tab in tabs"
                :key="tab.value"
                :class="[
                    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
                    activeTab === tab.value ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground',
                ]"
                @click="navigateTab(tab)"
            >
                <component
                    :is="tab.icon"
                    class="h-4 w-4"
                />
                <span class="hidden sm:inline">{{ tab.label }}</span>
            </button>
        </nav>
    </div>
</template>
