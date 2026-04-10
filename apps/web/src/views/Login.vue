<script setup lang="ts">
    import GitHubIcon from '@/components/icons/GitHubIcon.vue';
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
                await router.push('/workflows');
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
                <GitHubIcon class="h-5 w-5" />
                Login with GitHub
            </Button>
        </div>
    </div>
</template>
