<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Card from '@/components/ui/Card.vue';
    import {useAuth} from '@/composables/useAuth';
    import {BarChart3, BellRing, GitBranch, LayoutDashboard, Webhook} from 'lucide-vue-next';
    import {onMounted} from 'vue';
    import {useRouter} from 'vue-router';

    const {isAuthenticated, signIn} = useAuth();
    const router = useRouter();

    const features = [
        {icon: LayoutDashboard, text: 'Real-time CI/CD pipeline monitoring'},
        {icon: BarChart3, text: 'DORA & SPACE engineering metrics'},
        {icon: BellRing, text: 'Workflow failure notifications'},
        {icon: Webhook, text: 'GitHub App & webhook integrations'},
    ];

    const checkAuthAndRedirect = async () => {
        try {
            if (await isAuthenticated()) {
                await router.push('/dashboard');
            }
        } catch (error) {
            console.debug('User not authenticated, showing login page');
        }
    };

    onMounted(() => {
        checkAuthAndRedirect();
    });
</script>

<template>
    <div class="min-h-screen flex items-center justify-center bg-background px-4">
        <div class="w-full max-w-sm space-y-6">
            <div class="text-center space-y-2">
                <div class="flex items-center justify-center w-16 h-16 bg-primary rounded-2xl mx-auto mb-4">
                    <GitBranch class="h-8 w-8 text-primary-foreground" />
                </div>
                <h1 class="text-3xl font-bold">GitGazer</h1>
                <p class="text-muted-foreground">Monitor your GitHub workflows with ease</p>
            </div>

            <Card class="p-5">
                <div class="flex flex-col gap-3">
                    <div
                        v-for="feature in features"
                        :key="feature.text"
                        class="flex items-center gap-3"
                    >
                        <component
                            :is="feature.icon"
                            class="h-5 w-5 text-primary shrink-0"
                        />
                        <span class="text-sm">{{ feature.text }}</span>
                    </div>
                </div>
            </Card>

            <Button
                class="w-full gap-2"
                size="lg"
                @click="signIn"
            >
                <svg
                    class="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                >
                    <path
                        d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
                    />
                </svg>
                Login with GitHub
            </Button>
        </div>
    </div>
</template>
