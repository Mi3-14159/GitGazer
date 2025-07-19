<script setup lang="ts">
    import {Integration} from '@graphql/api';
    import {ref} from 'vue';

    const props = defineProps<{
        integration: Integration;
        currentUserSub: string;
        onDelete: (id: string) => void;
    }>();

    const integrationUrl = `${import.meta.env.VITE_IMPORT_URL_BASE}${props.integration.id}`;
    const ownerAnnotation = props.integration.owner === props.currentUserSub ? 'you' : 'not you';
    const showSecret = ref(false);
</script>

<template>
    <v-card
        class="ma-2 rounded-lg"
        style="width: 100%"
    >
        <v-card-title>{{ props.integration.label }}</v-card-title>
        <v-card-text>
            <v-container class="pa-0">
                <v-row
                    no-gutters
                    class="mb-2"
                >
                    <v-col
                        cols="4"
                        class="field-label"
                    >
                        Webhook payload URL:
                    </v-col>
                    <v-col
                        cols="8"
                        class="field-value"
                    >
                        <a
                            :href="integrationUrl"
                            target="_blank"
                            >{{ integrationUrl }}</a
                        >
                    </v-col>
                </v-row>
                <v-row
                    no-gutters
                    class="mb-2"
                >
                    <v-col
                        cols="4"
                        class="field-label"
                    >
                        Secret:
                    </v-col>
                    <v-col
                        cols="8"
                        class="field-value"
                    >
                        <div class="d-flex align-center">
                            <div class="secret-container">
                                <Transition
                                    name="fade"
                                    mode="out-in"
                                >
                                    <span
                                        v-if="showSecret"
                                        key="visible"
                                        >{{ props.integration.secret }}</span
                                    >
                                    <span
                                        v-else
                                        key="hidden"
                                        >••••••••••••••••</span
                                    >
                                </Transition>
                            </div>
                            <v-btn
                                variant="text"
                                density="compact"
                                @click="showSecret = !showSecret"
                                class="ml-2"
                                :color="showSecret ? 'warning' : undefined"
                                :icon="showSecret ? 'mdi-eye-off' : 'mdi-eye'"
                            ></v-btn>
                        </div>
                    </v-col>
                </v-row>
                <v-row
                    no-gutters
                    class="mb-2"
                >
                    <v-col
                        cols="4"
                        class="field-label"
                    >
                        Owner:
                    </v-col>
                    <v-col
                        cols="8"
                        class="field-value"
                    >
                        {{ ownerAnnotation }}
                    </v-col>
                </v-row>
            </v-container>
        </v-card-text>
        <v-card-actions>
            <v-spacer></v-spacer>
            <v-dialog max-width="500">
                <template v-slot:activator="{props: activatorProps}">
                    <v-btn
                        v-bind="activatorProps"
                        color="error"
                        text="delete"
                    ></v-btn>
                </template>

                <template v-slot:default="{isActive}">
                    <v-card>
                        <v-card-text>
                            Do you really want to delete this integration? This is irreversible and will break your current import jobs!
                        </v-card-text>
                        <v-card-actions>
                            <v-btn
                                text="Yes, delete"
                                color="error"
                                @click="
                                    onDelete(props.integration.id);
                                    isActive.value = false;
                                "
                            ></v-btn>
                        </v-card-actions>
                    </v-card>
                </template>
            </v-dialog>
        </v-card-actions>
    </v-card>
</template>

<style scoped>
    .field-label {
        font-weight: 500;
        color: rgba(var(--v-theme-on-surface), 0.87);
        padding: 2px 8px;
        vertical-align: top;
    }

    .field-value {
        color: rgba(var(--v-theme-on-surface), 0.6);
        padding: 2px 8px;
        vertical-align: top;
    }

    .secret-container {
        min-width: 290px;
        max-width: 290px;
        width: 290px;
        display: inline-block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .fade-enter-active,
    .fade-leave-active {
        transition: opacity 0.3s ease;
    }

    .fade-enter-from,
    .fade-leave-to {
        opacity: 0;
    }
</style>
