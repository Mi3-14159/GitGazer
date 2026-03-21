<script setup lang="ts">
    import ThemeToggle from '@/components/ThemeToggle.vue';
    import {useAuth} from '@/composables/useAuth';
    import type {UserAttributes} from '@common/types';
    import {GitBranch, LogOut} from 'lucide-vue-next';
    import {onMounted, ref} from 'vue';

    const {getUserAttributes, signOut} = useAuth();

    const user = ref<UserAttributes | null>(null);

    onMounted(async () => {
        user.value = await getUserAttributes();
    });

    async function handleLogout() {
        await signOut();
    }
</script>

<template>
    <header class="border-b bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50 sticky top-0 z-40">
        <div class="container mx-auto px-4 py-2">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="flex items-center justify-center w-8 h-8 bg-primary rounded-lg">
                        <GitBranch class="h-4 w-4 text-primary-foreground" />
                    </div>
                    <div class="flex items-center gap-2">
                        <h1 class="text-xl font-bold">GitGazer</h1>
                        <span class="text-sm text-muted-foreground hidden sm:inline"> Monitor your GitHub workflows with ease </span>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <ThemeToggle />
                    <div
                        v-if="user?.picture"
                        class="h-8 w-8 rounded-full overflow-hidden"
                    >
                        <img
                            :src="user.picture"
                            :alt="user.nickname || 'User'"
                            class="h-full w-full object-cover"
                        />
                    </div>
                    <button
                        class="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                        title="Sign out"
                        @click="handleLogout"
                    >
                        <LogOut class="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    </header>
</template>
