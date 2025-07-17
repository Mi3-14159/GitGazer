<script setup lang="ts">
    import {Integration} from '@graphql/api';
    import {ref} from 'vue';

    const props = defineProps<{
        integration: Integration;
        currentUserSub: string;
        onDelete: (id: string) => void;
    }>();

    const integrationUrl = `${import.meta.env.VITE_IMPORT_URL_BASE}${props.integration.id}`;
    const ownerAnnotation = props.integration.owner === props.currentUserSub ? ' (you)' : '(not you)';
    const showSecret = ref(false);
</script>

<template>
    <v-card class="ma-2 rounded-lg">
        <v-card-title>{{ props.integration.label }}</v-card-title>
        <v-card-text>
            <tbody class="integration-table">
                <tr>
                    <td>Webhook payload URL:</td>
                    <td>
                        <a
                            :href="integrationUrl"
                            target="_blank"
                            >{{ integrationUrl }}</a
                        >
                    </td>
                </tr>
                <tr>
                    <td>Secret:</td>
                    <td>
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
                    </td>
                </tr>
                <tr>
                    <td>Owner:</td>
                    <td>{{ props.integration.owner }} {{ ownerAnnotation }}</td>
                </tr>
                <tr>
                    <td>(TODO) Users:</td>
                    <td>{{ props.integration.users.join(', ') }}</td>
                </tr>
            </tbody>
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
    .integration-table td {
        padding: 2px 8px;
        vertical-align: top;
    }

    .integration-table td:first-child {
        font-weight: 500;
        color: rgba(var(--v-theme-on-surface), 0.87);
        width: 30%;
    }

    .integration-table td:last-child {
        color: rgba(var(--v-theme-on-surface), 0.6);
    }

    .secret-container {
        min-width: 180px;
        display: inline-block;
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
