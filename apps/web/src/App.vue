<script setup lang="ts">
    import {useAuth} from '@/composables/useAuth';
    import {useSettingsStore} from '@/stores/settings';
    import {onMounted} from 'vue';
    import {RouterView, useRouter} from 'vue-router';

    const {isAuthenticated} = useAuth();
    const router = useRouter();

    // Initialize settings store (triggers theme application to DOM)
    useSettingsStore();

    document.title = 'GitGazer';

    const initializeAuth = async () => {
        // Skip auth redirect for pages that handle their own auth flow
        const publicPaths = ['/login', '/invite/'];
        if (publicPaths.some((p) => router.currentRoute.value.path.startsWith(p))) {
            return;
        }

        try {
            const authenticated = await isAuthenticated();
            if (!authenticated) {
                await router.push('/login');
                return;
            }

            // Check for pending invite redirect after OAuth sign-in
            const inviteRedirect = sessionStorage.getItem('gitgazer:invite-redirect');
            if (inviteRedirect?.startsWith('/invite/')) {
                sessionStorage.removeItem('gitgazer:invite-redirect');
                await router.push(inviteRedirect);
            } else if (inviteRedirect) {
                sessionStorage.removeItem('gitgazer:invite-redirect');
            }
        } catch (error) {
            console.debug('User not authenticated, redirecting to login');
            await router.push('/login');
        }
    };

    onMounted(() => {
        initializeAuth();
    });
</script>

<template>
    <div class="min-h-screen bg-background text-foreground">
        <RouterView />
    </div>
</template>
