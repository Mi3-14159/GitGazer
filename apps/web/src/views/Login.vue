<script setup lang="ts">
    import {useAuth} from '@/composables/useAuth';
    import {onMounted} from 'vue';
    import {useRouter} from 'vue-router';

    const {isAuthenticated, signIn} = useAuth();
    const router = useRouter();

    const features = [
        {icon: 'mdi-view-dashboard', text: 'Real-time CI/CD pipeline monitoring'},
        {icon: 'mdi-chart-box-outline', text: 'DORA & SPACE engineering metrics'},
        {icon: 'mdi-bell-ring', text: 'Workflow failure notifications'},
        {icon: 'mdi-connection', text: 'GitHub App & webhook integrations'},
    ];

    const checkAuthAndRedirect = async () => {
        try {
            if (await isAuthenticated()) {
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
            <div class="text-center mb-6">
                <v-icon
                    icon="mdi-telescope"
                    size="64"
                    color="primary"
                    class="mb-4"
                />
                <h1 class="text-h3 font-weight-bold mb-2">GitGazer</h1>
                <p class="text-subtitle-1 text-medium-emphasis">Monitor your GitHub workflows with ease</p>
            </div>

            <v-card
                variant="tonal"
                rounded="lg"
                class="mb-8 pa-5"
            >
                <div class="d-flex flex-column ga-3">
                    <div
                        v-for="feature in features"
                        :key="feature.icon"
                        class="d-flex align-center"
                    >
                        <v-icon
                            :icon="feature.icon"
                            size="20"
                            color="primary"
                            class="me-3"
                        />
                        <span class="text-body-2">{{ feature.text }}</span>
                    </div>
                </div>
            </v-card>

            <div class="text-center">
                <v-btn
                    @click="signIn"
                    color="primary"
                    size="large"
                    variant="elevated"
                    prepend-icon="mdi-github"
                    block
                    rounded="lg"
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
