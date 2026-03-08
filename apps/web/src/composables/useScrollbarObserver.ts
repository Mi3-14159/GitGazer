import {onMounted, onUnmounted, ref, type Ref, unref} from 'vue';

export function useScrollbarObserver(target: Ref<HTMLElement | any | null>) {
    const hasScrollbar = ref(false);
    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;

    const getElement = () => {
        const val = unref(target);
        // If it's a Vue component, it has $el. If it's an HTML element, it is the element.
        return val?.$el ?? val;
    };

    const checkScrollbar = () => {
        const el = getElement();
        if (el && el instanceof HTMLElement) {
            // Use a small buffer for float precision issues if any
            hasScrollbar.value = el.scrollHeight > el.clientHeight + 1;
        }
    };

    onMounted(() => {
        const el = getElement();
        if (el && el instanceof HTMLElement) {
            checkScrollbar();
            // Double check after a short delay to allow virtual scroller to calculate layout
            setTimeout(checkScrollbar, 100);

            resizeObserver = new ResizeObserver(() => {
                checkScrollbar();
            });
            resizeObserver.observe(el);

            mutationObserver = new MutationObserver(() => {
                checkScrollbar();
            });
            mutationObserver.observe(el, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class'],
            });
        }
    });

    onUnmounted(() => {
        if (resizeObserver) resizeObserver.disconnect();
        if (mutationObserver) mutationObserver.disconnect();
    });

    return {
        hasScrollbar,
        checkScrollbar,
    };
}
