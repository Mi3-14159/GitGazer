<template>
    <div class="d-flex align-center column-header">
        <span>{{ title }}</span>
        <v-menu
            v-model="menuOpen"
            offset-y
            :close-on-content-click="false"
        >
            <template v-slot:activator="{props}">
                <v-btn
                    v-if="availableValues.length > 0"
                    icon
                    size="x-small"
                    variant="text"
                    v-bind="props"
                    class="ml-1"
                >
                    <v-icon :color="hasActiveFilters ? 'primary' : 'default'">mdi-filter-variant</v-icon>
                </v-btn>
            </template>
            <v-card min-width="200">
                <v-card-text>
                    <div class="d-flex justify-between align-center mb-2">
                        <span class="font-weight-medium">{{ filterLabel ?? `Show ${title}` }}</span>
                        <v-btn
                            v-if="hasActiveFilters"
                            size="small"
                            variant="text"
                            @click="handleClearFilter"
                        >
                            Select All
                        </v-btn>
                    </div>
                    <v-text-field
                        v-model="searchQuery"
                        density="compact"
                        placeholder="Search..."
                        prepend-inner-icon="mdi-magnify"
                        variant="outlined"
                        clearable
                        hide-details
                        class="mb-2"
                    />
                    <v-list
                        density="compact"
                        max-height="300"
                        style="overflow-y: auto"
                    >
                        <v-list-item
                            v-for="value in filteredValues"
                            :key="value"
                            @click="handleSelectOnly(value)"
                        >
                            <template v-slot:prepend>
                                <v-checkbox-btn
                                    :model-value="!hiddenValues?.has(value)"
                                    @click.stop="handleToggleFilter(value)"
                                />
                            </template>
                            <v-list-item-title class="text-body-2">{{ value }}</v-list-item-title>
                        </v-list-item>
                        <v-list-item v-if="filteredValues.length === 0">
                            <v-list-item-title class="text-body-2 text-disabled">No matches found</v-list-item-title>
                        </v-list-item>
                    </v-list>
                </v-card-text>
            </v-card>
        </v-menu>
        <v-btn
            v-if="sortable"
            icon
            size="x-small"
            variant="text"
            @click="emit('toggle-sort')"
            class="ml-1 sort-btn"
            :class="{'sort-active': isSorted}"
        >
            <v-icon :color="isSorted ? 'default' : 'grey'">{{ sortIcon }}</v-icon>
        </v-btn>
    </div>
</template>

<script setup lang="ts">
    import {computed, ref} from 'vue';

    interface Props {
        title: string;
        filterLabel?: string;
        availableValues: string[];
        hiddenValues?: Set<string>; // Values that are NOT selected (hidden)
        sortable?: boolean;
        sortIcon?: any;
        isSorted?: boolean;
    }

    interface Emits {
        (e: 'toggle-filter', value: string): void;
        (e: 'clear-filter'): void;
        (e: 'select-only', value: string): void;
        (e: 'toggle-sort'): void;
    }

    const props = withDefaults(defineProps<Props>(), {
        hiddenValues: () => new Set<string>(),
    });
    const emit = defineEmits<Emits>();

    const searchQuery = ref('');
    const menuOpen = ref(false);

    const hasActiveFilters = computed(() => (props.hiddenValues?.size ?? 0) > 0);

    const filteredValues = computed(() => {
        if (!searchQuery.value) {
            return props.availableValues;
        }
        const query = searchQuery.value.toLowerCase();
        return props.availableValues.filter((value) => value.toLowerCase().includes(query));
    });

    const handleToggleFilter = (value: string) => {
        emit('toggle-filter', value);
    };

    const handleSelectOnly = (value: string) => {
        emit('select-only', value);
    };

    const handleClearFilter = () => {
        emit('clear-filter');
    };
</script>

<style scoped>
    /* Filter dropdown styling */
    :deep(.v-list-item) {
        cursor: pointer;
    }

    :deep(.v-list-item:hover) {
        background-color: rgba(0, 0, 0, 0.04);
    }

    /* Sort button visibility - hide when not active or hovered */
    .sort-btn:not(.sort-active) {
        opacity: 0;
        transition: opacity 0.2s ease;
    }

    .column-header:hover .sort-btn:not(.sort-active) {
        opacity: 1;
    }
</style>
