<script setup lang="ts">
    import {useAuth} from '@/composables/useAuth';
    import {useSettingsStore} from '@/stores/settings';
    import {onMounted, watch} from 'vue';
    import {RouterView, useRouter} from 'vue-router';
    import {useTheme} from 'vuetify';

    const {isAuthenticated} = useAuth();
    const router = useRouter();
    const theme = useTheme();
    const settingsStore = useSettingsStore();

    // Set document title
    document.title = 'GitGazer';

    // Apply theme changes
    watch(
        () => settingsStore.resolvedTheme,
        (newTheme) => {
            theme.global.name.value = newTheme;
        },
        {immediate: true},
    );

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
