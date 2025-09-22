<template>
    <div class="d-flex align-center">
        <span>{{ title }}</span>
        <v-menu offset-y :close-on-content-click="false">
            <template v-slot:activator="{props}">
                <v-btn
                    icon
                    size="small"
                    variant="text"
                    v-bind="props"
                    class="ml-1"
                >
                    <v-icon
                        size="16"
                        :color="hasActiveFilters ? 'primary' : 'default'"
                    >
                        mdi-filter-variant
                    </v-icon>
                </v-btn>
            </template>
            <v-card min-width="200">
                <v-card-text>
                    <div class="d-flex justify-between align-center mb-2">
                        <span class="font-weight-medium">{{ filterLabel ?? `Hide ${title}` }}</span>
                        <v-btn
                            v-if="hasActiveFilters"
                            size="small"
                            variant="text"
                            @click="handleClearFilter"
                        >
                            Clear
                        </v-btn>
                    </div>
                    <v-list density="compact">
                        <v-list-item
                            v-for="value in availableValues"
                            :key="value"
                            @click="handleToggleFilter(value)"
                        >
                            <template v-slot:prepend>
                                <v-checkbox-btn
                                    :model-value="hiddenValues.has(value)"
                                    @click.stop="handleToggleFilter(value)"
                                />
                            </template>
                            <v-list-item-title class="text-body-2">{{ value }}</v-list-item-title>
                        </v-list-item>
                    </v-list>
                </v-card-text>
            </v-card>
        </v-menu>
    </div>
</template>

<script setup lang="ts">
    import {computed} from 'vue';

    interface Props {
        title: string;
        filterLabel?: string;
        availableValues: string[];
        hiddenValues: Set<string>;
    }

    interface Emits {
        (e: 'toggle-filter', value: string): void;
        (e: 'clear-filter'): void;
    }

    const props = defineProps<Props>();
    const emit = defineEmits<Emits>();

    const hasActiveFilters = computed(() => props.hiddenValues.size > 0);

    const handleToggleFilter = (value: string) => {
        emit('toggle-filter', value);
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
</style>
