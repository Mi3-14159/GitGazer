<script setup lang="ts">
    import {handleCallback} from '@/services/auth';
    import {onMounted, ref} from 'vue';
    import {useRouter} from 'vue-router';

    const router = useRouter();
    const error = ref<string | null>(null);
    const loading = ref(true);

    onMounted(async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const errorParam = urlParams.get('error');

        if (errorParam) {
            error.value = `Authentication error: ${errorParam}`;
            loading.value = false;
            return;
        }

        if (!code) {
            error.value = 'No authorization code received';
            loading.value = false;
            return;
        }

        try {
            const success = await handleCallback(code);
            if (success) {
                // Redirect to dashboard
                await router.push('/dashboard');
            } else {
                error.value = 'Authentication failed';
            }
        } catch (err) {
            console.error('Callback error:', err);
            error.value = 'An error occurred during authentication';
        } finally {
            loading.value = false;
        }
    });
</script>

<template>
    <v-container class="callback-container">
        <div class="callback-content">
            <div v-if="loading" class="text-center">
                <v-progress-circular indeterminate color="primary" size="64"></v-progress-circular>
                <h2 class="mt-4">Completing authentication...</h2>
            </div>

            <div v-else-if="error" class="text-center">
                <v-icon color="error" size="64">mdi-alert-circle</v-icon>
                <h2 class="mt-4">{{ error }}</h2>
                <v-btn class="mt-4" color="primary" @click="router.push('/login')">
                    Return to Login
                </v-btn>
            </div>
        </div>
    </v-container>
</template>

<style scoped>
    .callback-container {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .callback-content {
        max-width: 500px;
        width: 100%;
    }
</style>
