<script setup lang="ts">
    import {useSettingsStore, type ThemePreference} from '@/stores/settings';
    import {Monitor, Moon, Sun} from 'lucide-vue-next';
    import {computed} from 'vue';

    const settingsStore = useSettingsStore();

    const themes: {value: ThemePreference; icon: typeof Sun; label: string}[] = [
        {value: 'light', icon: Sun, label: 'Light'},
        {value: 'dark', icon: Moon, label: 'Dark'},
        {value: 'system', icon: Monitor, label: 'System'},
    ];

    const current = computed(() => settingsStore.themePreference);

    function cycle() {
        const idx = themes.findIndex((t) => t.value === current.value);
        const next = themes[(idx + 1) % themes.length];
        settingsStore.setThemePreference(next.value);
    }

    const currentIcon = computed(() => themes.find((t) => t.value === current.value)?.icon ?? Sun);
    const currentLabel = computed(() => themes.find((t) => t.value === current.value)?.label ?? 'Light');
</script>

<template>
    <button
        class="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
        :title="`Theme: ${currentLabel}`"
        @click="cycle"
    >
        <component
            :is="currentIcon"
            class="h-4 w-4"
        />
    </button>
</template>
