<script setup lang="ts">
    import {generateClient, type GraphQLQuery} from 'aws-amplify/api';
    import {AuthUser, fetchAuthSession, getCurrentUser} from 'aws-amplify/auth';
    import {
        listIntegrations,
        ListIntegrationsResponse,
        Integration,
        putIntegration,
        PutIntegrationsResponse,
        DeleteIntegrationResponse,
        deleteIntegration,
    } from '../queries';
    import {reactive, ref} from 'vue';
    import IntegrationCard from './IntegrationCard.vue';
    import IntegrationDetailsCard from './IntegrationDetailsCard.vue';

    const client = generateClient();
    const integrations = reactive(new Map());
    const user = ref<AuthUser>();
    const dialog = ref(false);

    const getUser = async () => {
        const currentUser = await getCurrentUser();
        user.value = currentUser;
    };

    getUser();

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

    const handlePutIntegration = async (integration: Integration) => {
        try {
            const response = await client.graphql<GraphQLQuery<PutIntegrationsResponse>>({
                query: putIntegration(integration.label),
            });

            integrations.set(response.data.putIntegration.id, response.data.putIntegration);
            await fetchAuthSession({forceRefresh: true});
        } catch (error) {
            console.error(error);
        }
    };

    const handleDeleteIntegration = async (id: string) => {
        try {
            const response = await client.graphql<GraphQLQuery<DeleteIntegrationResponse>>({
                query: deleteIntegration(id),
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
</script>

<template>
    <v-main>
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
                        text="Add"
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
    </v-main>
</template>

<style scoped></style>
