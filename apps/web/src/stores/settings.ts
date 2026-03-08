import {defineStore} from 'pinia';
import {computed, ref, watch} from 'vue';

export type ThemePreference = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'gitgazer-theme-preference';

export const useSettingsStore = defineStore('settings', () => {
    // Theme preference: 'light', 'dark', or 'system'
    const themePreference = ref<ThemePreference>((localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference) || 'system');

    // System color scheme preference
    const systemPrefersDark = ref<boolean>(window.matchMedia('(prefers-color-scheme: dark)').matches);

    // Resolved theme based on preference and system settings
    const resolvedTheme = computed<'light' | 'dark'>(() => {
        if (themePreference.value === 'system') {
            return systemPrefersDark.value ? 'dark' : 'light';
        }
        return themePreference.value;
    });

    // Listen to system color scheme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
        systemPrefersDark.value = e.matches;
    };
    mediaQuery.addEventListener('change', handleSystemThemeChange);

    // Persist theme preference to localStorage
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
