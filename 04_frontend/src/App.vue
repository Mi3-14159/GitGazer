<script setup lang="ts">
    import {useAuth} from '@/composables/useAuth';
    import {type AuthUser} from 'aws-amplify/auth';
    import {onMounted, ref} from 'vue';
    import {RouterView, useRouter} from 'vue-router';

    const {getUser} = useAuth();
    const router = useRouter();
    const user = ref<AuthUser>();

    // Set document title
    document.title = 'GitGazer';

    const initializeAuth = async () => {
        try {
            user.value = await getUser();
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
