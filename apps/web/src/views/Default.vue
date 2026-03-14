<script setup lang="ts">
    import ThemeToggle from '@/components/ThemeToggle.vue';
    import Badge from '@/components/ui/Badge.vue';
    import {useAuth} from '@/composables/useAuth';
    import {UserAttributes} from '@common/types';
    import {Activity, Bell, GitBranch, LayoutDashboard, LogOut, PlayCircle, Webhook} from 'lucide-vue-next';
    import {computed, onMounted, ref} from 'vue';
    import {useRoute, useRouter} from 'vue-router';

    const {getUserAttributes, signOut} = useAuth();
    const route = useRoute();
    const router = useRouter();

    const user = ref<UserAttributes>();

    onMounted(async () => {
        user.value = await getUserAttributes();
    });

    const tabs = [
        {value: 'overview', label: 'Overview', icon: Activity, path: '/overview'},
        {value: 'dashboards', label: 'Dashboards', icon: LayoutDashboard, path: '/analytics/system-dora'},
        {value: 'workflows', label: 'Workflows', icon: PlayCircle, path: '/dashboard'},
        {value: 'integrations', label: 'Integrations', icon: Webhook, path: '/integrations'},
        {value: 'notifications', label: 'Notifications', icon: Bell, path: '/notifications'},
    ];

    const activeTab = computed(() => {
        const path = route.path;
        if (path.startsWith('/overview')) return 'overview';
        if (path.startsWith('/analytics')) return 'dashboards';
        if (path.startsWith('/dashboard')) return 'workflows';
        if (path.startsWith('/integrations')) return 'integrations';
        if (path.startsWith('/notifications')) return 'notifications';
        return 'overview';
    });

    function navigateTab(tab: (typeof tabs)[number]) {
        router.push(tab.path);
    }

    async function handleLogout() {
        await signOut();
    }
</script>

<template>
    <div class="h-screen bg-background flex flex-col overflow-hidden">
        <!-- Header -->
        <header class="border-b bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50 sticky top-0 z-40">
            <div class="container mx-auto px-4 py-2">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="flex items-center justify-center w-8 h-8 bg-primary rounded-lg">
                            <GitBranch class="h-4 w-4 text-primary-foreground" />
                        </div>
                        <div class="flex items-center gap-2">
                            <h1 class="text-xl font-bold">GitGazer</h1>
                            <span class="text-sm text-muted-foreground hidden sm:inline"> Monitor your GitHub workflows with ease </span>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <Badge
                            variant="outline"
                            class="gap-1"
                        >
                            <Activity class="h-3 w-3" />
                            Running
                        </Badge>
                        <Badge
                            variant="outline"
                            class="gap-1"
                        >
                            <Bell class="h-3 w-3" />
                            New
                        </Badge>
                        <ThemeToggle />
                        <div
                            v-if="user?.picture"
                            class="h-8 w-8 rounded-full overflow-hidden"
                        >
                            <img
                                :src="user.picture"
                                :alt="user.nickname || 'User'"
                                class="h-full w-full object-cover"
                            />
                        </div>
                        <button
                            class="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                            title="Sign out"
                            @click="handleLogout"
                        >
                            <LogOut class="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>
        </header>

        <!-- Tab Navigation -->
        <div class="container mx-auto px-4 py-2">
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

        <!-- Main Content -->
        <main class="flex-1 container mx-auto px-4 pt-2 pb-4 flex flex-col min-h-0">
            <router-view v-slot="{Component}">
                <transition
                    name="fade"
                    mode="out-in"
                >
                    <component
                        :is="Component"
                        class="flex-1 min-h-0 flex flex-col"
                    />
                </transition>
            </router-view>
        </main>

        <!-- Footer -->
        <footer class="border-t shrink-0">
            <div class="container mx-auto px-4 py-4">
                <div class="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
                    <span>&copy; 2026 GitGazer &bull; GitHub App &amp; webhook integrations</span>
                    <span>Real-time CI/CD monitoring &bull; DORA & SPACE metrics</span>
                </div>
            </div>
        </footer>
    </div>
</template>

<style scoped>
    .fade-enter-active,
    .fade-leave-active {
        transition: opacity 0.15s ease;
    }
    .fade-enter-from,
    .fade-leave-to {
        opacity: 0;
    }
</style>
