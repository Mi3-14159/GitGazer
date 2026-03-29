<script setup lang="ts">
    import TourCompletion from '@/components/tour/TourCompletion.vue';
    import TourPopover from '@/components/tour/TourPopover.vue';
    import TourSpotlight from '@/components/tour/TourSpotlight.vue';
    import TourWelcome from '@/components/tour/TourWelcome.vue';
    import {useTour} from '@/composables/useTour';
    import {nextTick, onMounted, onUnmounted, ref, watch} from 'vue';
    import {useRouter} from 'vue-router';

    const router = useRouter();
    const {isActive, currentStep, currentStepConfig, totalSteps, shouldAutoStart, startTour, nextStep, prevStep, skipTour, completeTour} = useTour();

    const targetRect = ref<DOMRect | null>(null);
    let resizeObserver: ResizeObserver | null = null;
    let previousFocus: HTMLElement | null = null;

    function findTarget(): HTMLElement | null {
        const selector = currentStepConfig.value?.target;
        if (!selector) return null;
        return document.querySelector<HTMLElement>(selector);
    }

    function updateTargetRect() {
        const el = findTarget();
        if (el) {
            targetRect.value = el.getBoundingClientRect();
        } else {
            targetRect.value = null;
        }
    }

    function scrollToTarget() {
        const el = findTarget();
        if (!el) return;

        const rect = el.getBoundingClientRect();
        const isInView = rect.top >= 0 && rect.bottom <= window.innerHeight;
        if (!isInView) {
            el.scrollIntoView({behavior: 'smooth', block: 'center'});
        }
    }

    async function waitForTarget(maxWait = 2000): Promise<HTMLElement | null> {
        if (!currentStepConfig.value?.target) return null;
        const start = Date.now();
        while (Date.now() - start < maxWait) {
            const el = findTarget();
            if (el) return el;
            await new Promise((r) => setTimeout(r, 50));
        }
        return null;
    }

    async function setupStep() {
        if (currentStepConfig.value?.type === 'modal') {
            targetRect.value = null;
            return;
        }

        // Wait for the target element to appear in the DOM after route navigation
        const el = await waitForTarget();
        if (!el) {
            // Target not found — show popover centered without spotlight
            targetRect.value = null;
            return;
        }

        scrollToTarget();
        // Brief wait for scroll to settle
        await new Promise((r) => setTimeout(r, 100));
        await nextTick();
        updateTargetRect();

        // Observe target resizes
        resizeObserver?.disconnect();
        resizeObserver = new ResizeObserver(() => updateTargetRect());
        resizeObserver.observe(el);
    }

    watch([currentStep, isActive], () => {
        if (isActive.value) {
            setupStep();
        }
    });

    function handleKeydown(e: KeyboardEvent) {
        if (!isActive.value) return;

        if (e.key === 'Escape') {
            skipTour();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            nextStep();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            prevStep();
        }
    }

    let scrollRafId: number | null = null;
    function handleScroll() {
        if (!isActive.value || currentStepConfig.value?.type !== 'spotlight') return;
        if (scrollRafId !== null) return;
        scrollRafId = requestAnimationFrame(() => {
            updateTargetRect();
            scrollRafId = null;
        });
    }

    function handleResize() {
        if (isActive.value && currentStepConfig.value?.type === 'spotlight') {
            updateTargetRect();
        }
    }

    // Store focus for restoration
    watch(isActive, (active) => {
        if (active) {
            previousFocus = document.activeElement as HTMLElement;
        } else {
            previousFocus?.focus();
            previousFocus = null;
            resizeObserver?.disconnect();
        }
    });

    // Handle completion modal actions
    async function handleSetup() {
        completeTour();
        await router.push('/integrations');
    }

    async function handleOverview() {
        completeTour();
        await router.push('/overview');
    }

    function handleDismiss() {
        completeTour();
    }

    // Start on welcome step
    function handleWelcomeStart() {
        nextStep();
    }

    onMounted(() => {
        document.addEventListener('keydown', handleKeydown);
        window.addEventListener('scroll', handleScroll, true);
        window.addEventListener('resize', handleResize);

        if (shouldAutoStart.value) {
            startTour();
        }
    });

    onUnmounted(() => {
        document.removeEventListener('keydown', handleKeydown);
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleResize);
        resizeObserver?.disconnect();
        if (scrollRafId !== null) cancelAnimationFrame(scrollRafId);
    });
</script>

<template>
    <template v-if="isActive && currentStepConfig">
        <!-- Welcome modal (Step 1) -->
        <TourWelcome
            v-if="currentStepConfig.id === 'welcome'"
            @start="handleWelcomeStart"
            @skip="skipTour"
        />

        <!-- Completion modal (Last Step) -->
        <TourCompletion
            v-else-if="currentStepConfig.id === 'completion'"
            @setup="handleSetup"
            @overview="handleOverview"
            @dismiss="handleDismiss"
        />

        <!-- Spotlight steps -->
        <template v-else>
            <TourSpotlight :target-rect="targetRect" />
            <TourPopover
                :step="currentStepConfig"
                :step-index="currentStep"
                :total-steps="totalSteps"
                :target-rect="targetRect"
                @next="nextStep"
                @prev="prevStep"
                @skip="skipTour"
            />
        </template>
    </template>
</template>
