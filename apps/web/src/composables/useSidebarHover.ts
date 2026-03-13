import {ref} from 'vue';

const expanded = ref(false);
let collapseTimer: ReturnType<typeof setTimeout> | null = null;
const COLLAPSE_DELAY = 400;

function clearTimer() {
    if (collapseTimer) {
        clearTimeout(collapseTimer);
        collapseTimer = null;
    }
}

export function useSidebarHover() {
    function requestExpand() {
        clearTimer();
        expanded.value = true;
    }

    function requestCollapse() {
        clearTimer();
        collapseTimer = setTimeout(() => {
            expanded.value = false;
        }, COLLAPSE_DELAY);
    }

    return {expanded, requestExpand, requestCollapse};
}
