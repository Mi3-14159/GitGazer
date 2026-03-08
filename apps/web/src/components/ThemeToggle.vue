<script setup lang="ts">
    import {useSettingsStore, type ThemePreference} from '@/stores/settings';
    import {computed, ref} from 'vue';

    const props = defineProps<{
        rail?: boolean;
    }>();

    const settingsStore = useSettingsStore();
    const menuOpen = ref(false);

    const themeOptions = computed(() => [
        {
            value: 'light' as ThemePreference,
            icon: 'mdi-white-balance-sunny',
            tooltip: 'Light theme',
        },
        {
            value: 'dark' as ThemePreference,
            icon: 'mdi-moon-waning-crescent',
            tooltip: 'Dark theme',
        },
        {
            value: 'system' as ThemePreference,
            icon: 'mdi-monitor',
            tooltip: 'System theme',
        },
    ]);

    const currentTheme = computed({
        get: () => settingsStore.themePreference,
        set: (value: ThemePreference) => settingsStore.setThemePreference(value),
    });

    const currentThemeOption = computed(() => {
        return themeOptions.value.find((option) => option.value === currentTheme.value);
    });

    const handleThemeSelect = (value: ThemePreference) => {
        currentTheme.value = value;
        menuOpen.value = false;
    };
</script>

<template>
    <!-- Rail mode: Show current theme icon with menu on hover -->
    <v-menu
        v-if="rail"
        v-model="menuOpen"
        open-on-hover
        :close-on-content-click="false"
        location="end"
        transition="scale-transition"
        :open-delay="50"
        :close-delay="100"
    >
        <template v-slot:activator="{props: menuProps}">
            <v-btn
                v-bind="menuProps"
                :icon="currentThemeOption?.icon"
                variant="text"
                size="small"
            >
            </v-btn>
        </template>
        <v-list density="compact">
            <v-list-item
                v-for="option in themeOptions"
                :key="option.value"
                :active="option.value === currentTheme"
                @click="handleThemeSelect(option.value)"
            >
                <template v-slot:prepend>
                    <v-icon :icon="option.icon"></v-icon>
                </template>
                <v-list-item-title>{{ option.tooltip }}</v-list-item-title>
            </v-list-item>
        </v-list>
    </v-menu>

    <!-- Expanded mode: Show full button toggle -->
    <v-btn-toggle
        v-else
        v-model="currentTheme"
        mandatory
        variant="outlined"
        density="compact"
        divided
    >
        <v-btn
            v-for="option in themeOptions"
            :key="option.value"
            :value="option.value"
            size="small"
        >
            <v-tooltip
                location="bottom"
                :text="option.tooltip"
            >
                <template v-slot:activator="{props}">
                    <v-icon
                        v-bind="props"
                        :icon="option.icon"
                    ></v-icon>
                </template>
            </v-tooltip>
        </v-btn>
    </v-btn-toggle>
</template>
