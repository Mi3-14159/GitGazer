<script setup lang="ts">
    import AppLogo from '@/components/icons/AppLogo.vue';
    import Button from '@/components/ui/Button.vue';
    import {Sparkles} from 'lucide-vue-next';

    const emit = defineEmits<{
        start: [];
        skip: [];
    }>();
</script>

<template>
    <Teleport to="body">
        <div class="fixed inset-0 z-[60] flex items-center justify-center">
            <!-- Overlay -->
            <div class="fixed inset-0 bg-black/60 backdrop-blur-[2px]" />

            <!-- Modal -->
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Welcome to GitGazer tour"
                class="relative z-10 w-full max-w-[420px] mx-4 rounded-xl border bg-card p-6 shadow-xl tour-welcome-enter"
            >
                <!-- Logo -->
                <div class="flex flex-col items-center text-center mb-5">
                    <AppLogo
                        size="lg"
                        class="mb-4"
                    />
                    <div class="flex items-center gap-2 mb-2">
                        <Sparkles class="h-5 w-5 text-primary" />
                        <h2 class="text-xl font-bold text-foreground">Welcome to GitGazer!</h2>
                    </div>
                    <p class="text-sm text-muted-foreground leading-relaxed">
                        Your command center for GitHub workflow monitoring. Let&rsquo;s take a quick tour to get you up and running.
                    </p>
                </div>

                <!-- Actions -->
                <div class="flex flex-col gap-2">
                    <Button
                        class="w-full"
                        @click="emit('start')"
                    >
                        Start Tour &rarr;
                    </Button>
                    <button
                        class="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-1"
                        @click="emit('skip')"
                    >
                        Skip tour
                    </button>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
    .tour-welcome-enter {
        animation: tour-modal-enter 300ms ease-out;
    }

    @keyframes tour-modal-enter {
        from {
            opacity: 0;
            transform: scale(0.95);
        }
        to {
            opacity: 1;
            transform: scale(1);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .tour-welcome-enter {
            animation: none;
        }
    }
</style>
