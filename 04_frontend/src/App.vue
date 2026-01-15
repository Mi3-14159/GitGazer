<script setup lang="ts">
    import {checkAuth} from '@/services/auth';
    import {onMounted, ref} from 'vue';
    import {RouterView, useRouter} from 'vue-router';

    const router = useRouter();
    const authenticated = ref(false);

    // Set document title
    document.title = 'GitGazer';

    const initializeAuth = async () => {
        try {
            authenticated.value = await checkAuth();
            if (!authenticated.value) {
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
