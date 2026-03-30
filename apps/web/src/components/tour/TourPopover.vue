<script setup lang="ts">
    import type {TourStep} from '@/components/tour/tourSteps';
    import Button from '@/components/ui/Button.vue';
    import {Lightbulb} from 'lucide-vue-next';
    import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue';

    const props = defineProps<{
        step: TourStep;
        stepIndex: number;
        totalSteps: number;
        targetRect: DOMRect | null;
    }>();

    const emit = defineEmits<{
        next: [];
        prev: [];
        skip: [];
    }>();

    const popoverRef = ref<HTMLElement | null>(null);
    const position = ref({top: 0, left: 0});
    const isMobile = ref(window.innerWidth < 768);
    const gap = 12;

    function calcPosition() {
        if (!popoverRef.value) return;

        const el = popoverRef.value;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const pw = el.offsetWidth;
        const ph = el.offsetHeight;

        isMobile.value = vw < 768;

        // Center in viewport when no target
        if (!props.targetRect) {
            if (isMobile.value) {
                position.value = {top: 0, left: 0};
            } else {
                position.value = {
                    top: Math.max(12, (vh - ph) / 2),
                    left: Math.max(12, (vw - pw) / 2),
                };
            }
            return;
        }

        const rect = props.targetRect;
        const side = props.step.popoverSide ?? 'bottom';

        // Mobile: render as bottom sheet
        if (isMobile.value) {
            position.value = {top: 0, left: 0};
            return;
        }

        let top = 0;
        let left = 0;

        if (side === 'bottom') {
            top = rect.bottom + gap;
            left = rect.left + rect.width / 2 - pw / 2;
        } else if (side === 'top') {
            top = rect.top - ph - gap;
            left = rect.left + rect.width / 2 - pw / 2;
        } else if (side === 'right') {
            top = rect.top + rect.height / 2 - ph / 2;
            left = rect.right + gap;
        } else {
            top = rect.top + rect.height / 2 - ph / 2;
            left = rect.left - pw - gap;
        }

        // Clamp to viewport
        if (left < 12) left = 12;
        if (left + pw > vw - 12) left = vw - pw - 12;
        if (top < 12) top = 12;
        if (top + ph > vh - 12) top = vh - ph - 12;

        position.value = {top, left};
    }

    const progressDots = computed(() =>
        Array.from({length: props.totalSteps}, (_, i) => ({
            active: i === props.stepIndex,
            key: i,
        })),
    );

    watch(
        () => [props.targetRect, props.stepIndex],
        () => {
            nextTick(calcPosition);
        },
    );

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Tab') {
            // Focus trap
            const focusable = popoverRef.value?.querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"])');
            if (!focusable?.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }

    onMounted(() => {
        nextTick(() => {
            calcPosition();
            const first = popoverRef.value?.querySelector<HTMLElement>('button');
            first?.focus();
        });
        window.addEventListener('resize', calcPosition);
    });

    onUnmounted(() => {
        window.removeEventListener('resize', calcPosition);
    });
</script>

<template>
    <Teleport to="body">
        <!-- Screen reader announcement for step changes -->
        <div
            aria-live="polite"
            class="sr-only"
        >
            Step {{ stepIndex + 1 }} of {{ totalSteps }}: {{ step.title }}
        </div>

        <div
            ref="popoverRef"
            role="dialog"
            aria-modal="true"
            :aria-label="`Tour step ${stepIndex + 1} of ${totalSteps}: ${step.title}`"
            :class="[
                'fixed z-[70] border bg-card shadow-xl animate-in duration-200',
                isMobile
                    ? 'inset-x-0 bottom-0 w-full max-h-[60vh] overflow-y-auto rounded-t-xl p-5 fade-in-0 slide-in-from-bottom-4'
                    : 'w-auto max-w-sm rounded-xl p-4 fade-in-0 zoom-in-95',
            ]"
            :style="isMobile ? undefined : {top: `${position.top}px`, left: `${position.left}px`}"
            @keydown="handleKeydown"
        >
            <!-- Progress dots + counter -->
            <div class="flex items-center justify-between mb-3">
                <div
                    class="flex items-center gap-1"
                    role="progressbar"
                    :aria-valuenow="stepIndex + 1"
                    :aria-valuemin="1"
                    :aria-valuemax="totalSteps"
                >
                    <span
                        v-for="dot in progressDots"
                        :key="dot.key"
                        class="block h-1.5 w-1.5 rounded-full transition-colors"
                        :class="dot.active ? 'bg-primary' : 'bg-muted-foreground/30'"
                    />
                </div>
                <span class="text-xs text-muted-foreground">Step {{ stepIndex + 1 }} of {{ totalSteps }}</span>
            </div>

            <!-- Icon + Title -->
            <div class="flex items-center gap-2 mb-2">
                <component
                    :is="step.icon"
                    class="h-5 w-5 text-primary shrink-0"
                />
                <h3 class="text-lg font-semibold text-foreground">{{ step.title }}</h3>
            </div>

            <!-- Description -->
            <p class="text-sm text-muted-foreground leading-relaxed mb-3">{{ step.description }}</p>

            <!-- Tip callout -->
            <div
                v-if="step.tip"
                class="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/10 p-2.5 mb-4"
            >
                <Lightbulb class="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p class="text-xs text-muted-foreground leading-relaxed">{{ step.tip }}</p>
            </div>

            <!-- Navigation -->
            <div class="flex items-center justify-between">
                <Button
                    v-if="stepIndex > 1"
                    variant="ghost"
                    size="sm"
                    @click="emit('prev')"
                >
                    ← Back
                </Button>
                <span v-else />
                <Button
                    size="sm"
                    @click="emit('next')"
                >
                    {{ stepIndex < totalSteps - 1 ? 'Next →' : 'Finish' }}
                </Button>
            </div>

            <!-- Skip link -->
            <div class="text-center mt-2">
                <button
                    class="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    @click="emit('skip')"
                >
                    Skip tour
                </button>
            </div>
        </div>
    </Teleport>
</template>
