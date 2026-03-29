<script setup lang="ts">
    import ThemeToggle from '@/components/ThemeToggle.vue';
    import DropdownMenu from '@/components/ui/DropdownMenu.vue';
    import {useAuth} from '@/composables/useAuth';
    import {useTour} from '@/composables/useTour';
    import type {UserAttributes} from '@common/types';
    import {CircleHelp, GitBranch, LogOut, Play, RotateCcw} from 'lucide-vue-next';
    import {DropdownMenuItem} from 'radix-vue';
    import {onMounted, ref} from 'vue';

    const {getUserAttributes, signOut} = useAuth();
    const {isActive, canResume, tourCompleted, resetTour, resumeTour} = useTour();

    const user = ref<UserAttributes | null>(null);
    const helpOpen = ref(false);
    const showPulse = ref(false);

    onMounted(async () => {
        user.value = await getUserAttributes();
        if (!tourCompleted.value) {
            showPulse.value = true;
            setTimeout(() => {
                showPulse.value = false;
            }, 4000);
        }
    });

    function handleRestart() {
        helpOpen.value = false;
        resetTour();
    }

    function handleResume() {
        helpOpen.value = false;
        resumeTour();
    }

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

                    <!-- Help / Tour button -->
                    <DropdownMenu
                        v-if="!isActive"
                        v-model:open="helpOpen"
                    >
                        <template #trigger>
                            <button
                                class="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                                title="Help"
                            >
                                <CircleHelp class="h-4 w-4" />
                                <span
                                    v-if="canResume"
                                    class="absolute top-1.5 right-1.5 block h-2 w-2 rounded-full bg-primary"
                                />
                                <span
                                    v-if="showPulse"
                                    class="absolute inset-0 rounded-lg animate-ping bg-primary/20"
                                />
                            </button>
                        </template>
                        <DropdownMenuItem
                            class="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent outline-none"
                            @click="handleRestart"
                        >
                            <RotateCcw class="h-3.5 w-3.5" />
                            Restart tour
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            v-if="canResume"
                            class="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent outline-none"
                            @click="handleResume"
                        >
                            <Play class="h-3.5 w-3.5" />
                            Resume tour
                        </DropdownMenuItem>
                    </DropdownMenu>

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
