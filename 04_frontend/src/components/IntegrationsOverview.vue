<script setup lang="ts">
    import IntegrationCard from '@components/IntegrationCard.vue';
    import IntegrationDetailsCard from '@components/IntegrationDetailsCard.vue';
    import {DeleteIntegrationMutationVariables, Integration, PutIntegrationMutationVariables} from '@graphql/api';
    import {deleteIntegration, putIntegration} from '@graphql/mutations';
    import {listIntegrations} from '@graphql/queries';
    import {generateClient, type GraphQLQuery} from 'aws-amplify/api';
    import {AuthUser, fetchAuthSession, getCurrentUser} from 'aws-amplify/auth';
    import {computed, reactive, ref} from 'vue';
    import {useDisplay} from 'vuetify';

    const client = generateClient();
    const integrations = reactive(new Map());
    const user = ref<AuthUser>();
    const dialog = ref(false);
    const {smAndDown} = useDisplay();
    const showSecret = reactive(new Map<string, boolean>());

    const getUser = async () => {
        const currentUser = await getCurrentUser();
        user.value = currentUser;
    };

    getUser();

    type ListIntegrationsResponse = {
        listIntegrations: Integration[];
    };

    const handleListIntegrations = async () => {
        try {
            const response = await client.graphql<GraphQLQuery<ListIntegrationsResponse>>({
                query: listIntegrations,
            });
            response.data.listIntegrations.forEach((integration: Integration) => {
                integrations.set(integration.id, integration);
            });
        } catch (error) {
            console.error(error);
        }
    };

    handleListIntegrations();

    type PutIntegrationsResponse = {
        putIntegration: Integration;
    };

    const handlePutIntegration = async (integration: Integration) => {
        try {
            const variables: PutIntegrationMutationVariables = {input: {label: integration.label}};
            const response = await client.graphql<GraphQLQuery<PutIntegrationsResponse>>({
                query: putIntegration,
                variables,
            });

            integrations.set(response.data.putIntegration.id, response.data.putIntegration);
            await fetchAuthSession({forceRefresh: true});
        } catch (error) {
            console.error(error);
        }
    };

    type DeleteIntegrationResponse = {
        deleteIntegration: boolean;
    };

    const handleDeleteIntegration = async (id: string) => {
        try {
            const variables: DeleteIntegrationMutationVariables = {id};
            const response = await client.graphql<GraphQLQuery<DeleteIntegrationResponse>>({
                query: deleteIntegration,
                variables,
            });

            if (response.data.deleteIntegration) {
                integrations.delete(id);
                await fetchAuthSession({forceRefresh: true});
            } else {
                console.error('Integration could not be deleted');
            }
        } catch (error) {
            console.error(error);
        }
    };

    const onSave = async (integration: Integration) => {
        await handlePutIntegration(integration);
        dialog.value = false;
    };

    const toggleSecret = (id: string) => {
        showSecret.set(id, !showSecret.get(id));
    };

    const getIntegrationUrl = (id: string) => {
        return `${import.meta.env.VITE_IMPORT_URL_BASE}${id}`;
    };

    const getOwnerAnnotation = (owner: string) => {
        return owner === user.value?.userId ? 'you' : 'not you';
    };

    const headers = [
        {title: 'Label', key: 'label', sortable: true},
        {title: 'Webhook URL', key: 'webhookUrl', sortable: false},
        {title: 'Secret', key: 'secret', sortable: false},
        {title: 'Owner', key: 'owner', sortable: true},
        {title: 'Actions', key: 'actions', sortable: false, align: 'end' as const},
    ];

    const integrationsArray = computed(() => {
        return Array.from(integrations.values());
    });
</script>

<template>
    <v-main>
        <!-- Desktop Table View -->
        <div v-if="!smAndDown">
            <v-toolbar flat>
                <v-toolbar-title>Integrations</v-toolbar-title>
                <v-spacer></v-spacer>
                <v-dialog
                    v-model="dialog"
                    max-width="600"
                >
                    <template v-slot:activator="{props: activatorProps}">
                        <v-btn
                            prepend-icon="mdi-plus"
                            text="Add Integration"
                            color="primary"
                            v-bind="activatorProps"
                        ></v-btn>
                    </template>
                    <IntegrationDetailsCard
                        v-if="dialog"
                        :onClose="() => (dialog = false)"
                        :onSave="onSave"
                    />
                </v-dialog>
            </v-toolbar>

            <v-data-table
                :headers="headers"
                :items="integrationsArray"
                item-value="id"
                class="elevation-1"
            >
                <template v-slot:item.label="{item}">
                    <span class="font-weight-medium">{{ item.label }}</span>
                </template>

                <template v-slot:item.webhookUrl="{item}">
                    <a
                        :href="getIntegrationUrl(item.id)"
                        target="_blank"
                        class="text-decoration-none"
                    >
                        {{ getIntegrationUrl(item.id) }}
                    </a>
                </template>

                <template v-slot:item.secret="{item}">
                    <div class="d-flex align-center">
                        <span class="secret-container">
                            <Transition
                                name="fade"
                                mode="out-in"
                            >
                                <span
                                    v-if="showSecret.get(item.id)"
                                    key="visible"
                                >
                                    {{ item.secret }}
                                </span>
                                <span
                                    v-else
                                    key="hidden"
                                >
                                    ••••••••••••••••
                                </span>
                            </Transition>
                        </span>
                        <v-btn
                            variant="text"
                            density="compact"
                            @click="toggleSecret(item.id)"
                            class="ml-2"
                            :color="showSecret.get(item.id) ? 'warning' : undefined"
                            :icon="showSecret.get(item.id) ? 'mdi-eye-off' : 'mdi-eye'"
                        ></v-btn>
                    </div>
                </template>

                <template v-slot:item.owner="{item}">{{ getOwnerAnnotation(item.owner) }}</template>

                <template v-slot:item.actions="{item}">
                    <v-dialog max-width="500">
                        <template v-slot:activator="{props: activatorProps}">
                            <v-btn
                                v-bind="activatorProps"
                                color="error"
                                variant="text"
                                icon="mdi-delete"
                                density="compact"
                            ></v-btn>
                        </template>

                        <template v-slot:default="{isActive}">
                            <v-card>
                                <v-card-title>Delete Integration</v-card-title>
                                <v-card-text>
                                    Do you really want to delete this integration? This is irreversible and will break your current import jobs!
                                </v-card-text>
                                <v-card-actions>
                                    <v-spacer></v-spacer>
                                    <v-btn
                                        text="Cancel"
                                        @click="isActive.value = false"
                                    ></v-btn>
                                    <v-btn
                                        text="Yes, delete"
                                        color="error"
                                        @click="
                                            handleDeleteIntegration(item.id);
                                            isActive.value = false;
                                        "
                                    ></v-btn>
                                </v-card-actions>
                            </v-card>
                        </template>
                    </v-dialog>
                </template>
            </v-data-table>
        </div>

        <!-- Mobile Card View -->
        <div v-else>
            <v-row
                align="start"
                v-for="[key, integration] in integrations"
                :key="key"
                no-gutters
            >
                <IntegrationCard
                    :integration="integration"
                    :currentUserSub="user?.userId || ''"
                    :onDelete="handleDeleteIntegration"
                />
            </v-row>

            <v-bottom-navigation :elevation="0">
                <v-dialog
                    v-model="dialog"
                    max-width="600"
                >
                    <template v-slot:activator="{props: activatorProps}">
                        <v-btn
                            prepend-icon="mdi-plus"
                            text="Add Integration"
                            color="primary"
                            v-bind="activatorProps"
                        ></v-btn>
                    </template>
                    <IntegrationDetailsCard
                        v-if="dialog"
                        :onClose="() => (dialog = false)"
                        :onSave="onSave"
                    />
                </v-dialog>
            </v-bottom-navigation>
        </div>
    </v-main>
</template>

<style scoped>
    .secret-container {
        min-width: 265px;
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
