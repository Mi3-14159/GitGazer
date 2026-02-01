<script setup lang="ts">
    import {useAuth} from '@/composables/useAuth';
    import {onMounted} from 'vue';
    import {RouterView, useRouter} from 'vue-router';

    const {isAuthenticated} = useAuth();
    const router = useRouter();

    // Set document title
    document.title = 'GitGazer';

    const initializeAuth = async () => {
        try {
            const authenticated = await isAuthenticated();
            if (!authenticated) {
                await router.push('/login');
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
    <v-app>
        <RouterView />
    </v-app>
</template>
