<script setup lang="ts">
    import {checkAuth, signIn} from '@/services/auth';
    import {onMounted} from 'vue';
    import {useRouter} from 'vue-router';

    const router = useRouter();

    const checkAuthAndRedirect = async () => {
        try {
            const authenticated = await checkAuth();
            if (authenticated) {
                await router.push('/dashboard');
            }
        } catch (error) {
            // User not authenticated, stay on login page
            console.debug('User not authenticated, showing login page');
        }
    };

    onMounted(() => {
        checkAuthAndRedirect();
    });
</script>

<template>
    <v-container class="login-container">
        <div class="login-content">
            <div class="text-center mb-8">
                <h1 class="text-h3 font-weight-bold mb-2">GitGazer</h1>
                <p class="text-subtitle-1 text-medium-emphasis">Monitor your GitHub workflows with ease</p>
            </div>

            <v-divider class="mb-8"></v-divider>

            <div class="text-center">
                <v-btn
                    @click="signIn"
                    color="primary"
                    size="large"
                    variant="elevated"
                    prepend-icon="mdi-github"
                >
                    Login with GitHub
                </v-btn>
            </div>
        </div>
    </v-container>
</template>

<style scoped>
    .login-container {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .login-content {
        max-width: 400px;
        width: 100%;
    }
</style>
