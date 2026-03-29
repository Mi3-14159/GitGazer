import {tourSteps} from '@/components/tour/tourSteps';
import {computed, ref, watch} from 'vue';
import {useRouter} from 'vue-router';

const STORAGE_KEY = 'gitgazer:tour';

interface TourPersistence {
    tourCompleted: boolean;
    tourDismissedAt: string | null;
    tourLastStep: number;
}

function loadPersistence(): TourPersistence {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw) as TourPersistence;
    } catch {
        /* ignore corrupt data */
    }
    return {tourCompleted: false, tourDismissedAt: null, tourLastStep: 0};
}

function savePersistence(data: TourPersistence) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const isActive = ref(false);
const currentStep = ref(0);
const persistence = ref<TourPersistence>(loadPersistence());

export function useTour() {
    const router = useRouter();

    const totalSteps = tourSteps.length;

    const currentStepConfig = computed(() => tourSteps[currentStep.value]);
    const isFirstStep = computed(() => currentStep.value === 0);
    const isLastStep = computed(() => currentStep.value === totalSteps - 1);
    const progress = computed(() => (totalSteps > 1 ? currentStep.value / (totalSteps - 1) : 0));
    const canResume = computed(() => !persistence.value.tourCompleted && persistence.value.tourDismissedAt !== null);
    const shouldAutoStart = computed(() => !persistence.value.tourCompleted && persistence.value.tourDismissedAt === null);

    watch(persistence, (v) => savePersistence(v), {deep: true});

    async function navigateToStepRoute(step: number) {
        const config = tourSteps[step];
        if (config.route && router.currentRoute.value.path !== config.route) {
            await router.push(config.route);
        }
    }

    let isNavigating = false;

    function startTour() {
        currentStep.value = 0;
        isActive.value = true;
    }

    async function nextStep() {
        if (isNavigating) return;
        isNavigating = true;
        try {
            if (currentStep.value < totalSteps - 1) {
                const next = currentStep.value + 1;
                await navigateToStepRoute(next);
                currentStep.value = next;
                persistence.value.tourLastStep = next;
            } else {
                completeTour();
            }
        } finally {
            isNavigating = false;
        }
    }

    async function prevStep() {
        if (isNavigating) return;
        isNavigating = true;
        try {
            if (currentStep.value > 0) {
                const prev = currentStep.value - 1;
                await navigateToStepRoute(prev);
                currentStep.value = prev;
            }
        } finally {
            isNavigating = false;
        }
    }

    function skipTour() {
        isActive.value = false;
        persistence.value.tourDismissedAt = new Date().toISOString();
        persistence.value.tourLastStep = currentStep.value;
    }

    async function resumeTour() {
        const step = persistence.value.tourLastStep;
        await navigateToStepRoute(step);
        currentStep.value = step;
        isActive.value = true;
    }

    function resetTour() {
        persistence.value = {tourCompleted: false, tourDismissedAt: null, tourLastStep: 0};
        currentStep.value = 0;
        isActive.value = true;
    }

    function completeTour() {
        isActive.value = false;
        persistence.value.tourCompleted = true;
        persistence.value.tourDismissedAt = null;
    }

    return {
        isActive,
        currentStep,
        totalSteps,
        currentStepConfig,
        isFirstStep,
        isLastStep,
        progress,
        canResume,
        shouldAutoStart,
        tourCompleted: computed(() => persistence.value.tourCompleted),
        startTour,
        nextStep,
        prevStep,
        skipTour,
        resumeTour,
        resetTour,
        completeTour,
    };
}
