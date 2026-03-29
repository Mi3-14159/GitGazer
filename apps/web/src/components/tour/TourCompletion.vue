<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import {PartyPopper} from 'lucide-vue-next';
    import {onMounted, ref} from 'vue';

    const emit = defineEmits<{
        setup: [];
        overview: [];
        dismiss: [];
    }>();

    const confettiColors = ['#4a9eff', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ec4899'];
    const confettiPieces = Array.from({length: 40}, (_, i) => ({
        key: i,
        x: `${Math.random() * 100}vw`,
        delay: `${Math.random() * 0.6}s`,
        rotation: `${Math.random() * 360}deg`,
        color: confettiColors[i % confettiColors.length],
    }));

    const showConfetti = ref(false);

    onMounted(() => {
        showConfetti.value = true;
        setTimeout(() => {
            showConfetti.value = false;
        }, 2500);
    });
</script>

<template>
    <Teleport to="body">
        <div class="fixed inset-0 z-[60] flex items-center justify-center">
            <!-- Overlay -->
            <div class="fixed inset-0 bg-black/60 backdrop-blur-[2px]" />

            <!-- Confetti -->
            <div
                v-if="showConfetti"
                class="fixed inset-0 pointer-events-none overflow-hidden z-20"
                aria-hidden="true"
            >
                <span
                    v-for="piece in confettiPieces"
                    :key="piece.key"
                    class="confetti-piece"
                    :style="
                        {
                            '--x': piece.x,
                            '--delay': piece.delay,
                            '--rotation': piece.rotation,
                            '--color': piece.color,
                        } as Record<string, string>
                    "
                />
            </div>

            <!-- Modal -->
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Tour complete"
                class="relative z-30 w-full max-w-[420px] mx-4 rounded-xl border bg-card p-6 shadow-xl tour-welcome-enter"
            >
                <div class="flex flex-col items-center text-center mb-5">
                    <div class="flex items-center justify-center w-14 h-14 bg-success/10 rounded-2xl mb-4">
                        <PartyPopper class="h-7 w-7 text-success" />
                    </div>
                    <h2 class="text-xl font-bold text-foreground mb-2">You&rsquo;re All Set!</h2>
                    <p class="text-sm text-muted-foreground leading-relaxed">
                        You&rsquo;ve seen the key features of GitGazer. The recommended next step is to set up your first integration.
                    </p>
                </div>

                <div class="flex flex-col gap-2">
                    <Button
                        class="w-full"
                        @click="emit('setup')"
                    >
                        Set Up Integration &rarr;
                    </Button>
                    <Button
                        variant="outline"
                        class="w-full"
                        @click="emit('overview')"
                    >
                        Go to Overview
                    </Button>
                    <button
                        class="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-1"
                        @click="emit('dismiss')"
                    >
                        Dismiss
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

    .confetti-piece {
        position: absolute;
        top: -10px;
        left: var(--x);
        width: 8px;
        height: 8px;
        background: var(--color);
        border-radius: 1px;
        animation: confetti-fall 2s ease-in var(--delay) forwards;
    }

    @keyframes confetti-fall {
        0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
        }
        100% {
            transform: translateY(100vh) rotate(var(--rotation));
            opacity: 0;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .tour-welcome-enter {
            animation: none;
        }

        .confetti-piece {
            animation: none;
            display: none;
        }
    }
</style>
