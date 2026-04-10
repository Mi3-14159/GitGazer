<script setup lang="ts">
    import GitHubIcon from '@/components/icons/GitHubIcon.vue';
    import Button from '@/components/ui/Button.vue';
    import Card from '@/components/ui/Card.vue';
    import {useAuth} from '@/composables/useAuth';
    import {useMembers} from '@/composables/useMembers';
    import {AlertCircle, CheckCircle2, GitBranch, Loader2, LogIn} from 'lucide-vue-next';
    import {onMounted, ref} from 'vue';
    import {useRoute, useRouter} from 'vue-router';

    const route = useRoute();
    const router = useRouter();
    const {isAuthenticated, signIn} = useAuth();
    const {acceptInvitation} = useMembers();

    const token = route.params.token as string;

    type PageState = 'checking-auth' | 'needs-login' | 'accepting' | 'success' | 'error';
    const state = ref<PageState>('checking-auth');
    const errorMessage = ref('');

    async function tryAccept() {
        state.value = 'accepting';
        try {
            await acceptInvitation(token);
            state.value = 'success';
        } catch (e) {
            state.value = 'error';
            errorMessage.value = e instanceof Error ? e.message : 'Failed to accept invitation';
        }
    }

    onMounted(async () => {
        if (!token) {
            state.value = 'error';
            errorMessage.value = 'Invalid invitation link — no token provided.';
            return;
        }

        const authenticated = await isAuthenticated();
        if (!authenticated) {
            state.value = 'needs-login';
            return;
        }

        await tryAccept();
    });

    function handleSignIn() {
        // Store the invite path so we can return after auth
        sessionStorage.setItem('gitgazer:invite-redirect', route.fullPath);
        signIn();
    }

    function goToDashboard() {
        router.push('/overview');
    }
</script>

<template>
    <div class="min-h-screen flex items-center justify-center bg-background px-4">
        <div class="w-full max-w-sm space-y-6">
            <!-- Logo -->
            <div class="text-center space-y-2">
                <div class="flex items-center justify-center w-16 h-16 bg-primary rounded-2xl mx-auto mb-4">
                    <GitBranch class="h-8 w-8 text-primary-foreground" />
                </div>
                <h1 class="text-3xl font-bold">GitGazer</h1>
            </div>

            <!-- Checking auth -->
            <Card
                v-if="state === 'checking-auth'"
                class="p-6"
            >
                <div class="flex flex-col items-center gap-3 text-center">
                    <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
                    <p class="text-sm text-muted-foreground">Verifying your session…</p>
                </div>
            </Card>

            <!-- Needs login -->
            <Card
                v-else-if="state === 'needs-login'"
                class="p-6"
            >
                <div class="flex flex-col items-center gap-4 text-center">
                    <LogIn class="h-8 w-8 text-primary" />
                    <div class="space-y-1">
                        <h2 class="text-lg font-semibold">Sign in to accept</h2>
                        <p class="text-sm text-muted-foreground">You need to sign in with GitHub before accepting this invitation.</p>
                    </div>
                    <Button
                        class="w-full gap-2"
                        size="lg"
                        @click="handleSignIn"
                    >
                        <GitHubIcon class="h-5 w-5" />
                        Sign in with GitHub
                    </Button>
                </div>
            </Card>

            <!-- Accepting -->
            <Card
                v-else-if="state === 'accepting'"
                class="p-6"
            >
                <div class="flex flex-col items-center gap-3 text-center">
                    <Loader2 class="h-8 w-8 animate-spin text-primary" />
                    <p class="text-sm text-muted-foreground">Accepting your invitation…</p>
                </div>
            </Card>

            <!-- Success -->
            <Card
                v-else-if="state === 'success'"
                class="p-6"
            >
                <div class="flex flex-col items-center gap-4 text-center">
                    <div class="flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30">
                        <CheckCircle2 class="h-6 w-6 text-green-600 dark:text-green-400" />
                    </div>
                    <div class="space-y-1">
                        <h2 class="text-lg font-semibold">You're in!</h2>
                        <p class="text-sm text-muted-foreground">Your invitation has been accepted. You now have access to the integration.</p>
                    </div>
                    <Button
                        class="w-full"
                        @click="goToDashboard"
                    >
                        Go to Dashboard
                    </Button>
                </div>
            </Card>

            <!-- Error -->
            <Card
                v-else-if="state === 'error'"
                class="p-6"
            >
                <div class="flex flex-col items-center gap-4 text-center">
                    <div class="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10">
                        <AlertCircle class="h-6 w-6 text-destructive" />
                    </div>
                    <div class="space-y-1">
                        <h2 class="text-lg font-semibold">Something went wrong</h2>
                        <p class="text-sm text-muted-foreground">{{ errorMessage }}</p>
                    </div>
                    <Button
                        variant="outline"
                        class="w-full"
                        @click="goToDashboard"
                    >
                        Go to Dashboard
                    </Button>
                </div>
            </Card>
        </div>
    </div>
</template>
