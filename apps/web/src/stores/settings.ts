import {defineStore} from 'pinia';
import {computed, ref, watch} from 'vue';

export type ThemePreference = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'gitgazer-theme-preference';

function applyThemeToDOM(theme: 'light' | 'dark') {
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
}

export const useSettingsStore = defineStore('settings', () => {
    const themePreference = ref<ThemePreference>((localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference) || 'system');
    const systemPrefersDark = ref<boolean>(window.matchMedia('(prefers-color-scheme: dark)').matches);

    const resolvedTheme = computed<'light' | 'dark'>(() => {
        if (themePreference.value === 'system') {
            return systemPrefersDark.value ? 'dark' : 'light';
        }
        return themePreference.value;
    });

    // Apply theme to DOM whenever it changes
    watch(
        resolvedTheme,
        (newTheme) => {
            applyThemeToDOM(newTheme);
        },
        {immediate: true},
    );

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', (e: MediaQueryListEvent) => {
        systemPrefersDark.value = e.matches;
    });

    watch(themePreference, (newValue) => {
        localStorage.setItem(THEME_STORAGE_KEY, newValue);
    });

    function setThemePreference(preference: ThemePreference) {
        themePreference.value = preference;
    }

    return {
        themePreference,
        resolvedTheme,
        systemPrefersDark,
        setThemePreference,
    };
});
