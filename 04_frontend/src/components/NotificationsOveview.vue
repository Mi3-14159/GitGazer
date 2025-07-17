<script setup lang="ts">
    import NotificationCard from '@components/NotificationCard.vue';
    import NotificationDetailsCard from '@components/NotificationDetailsCard.vue';
    import type {
        DeleteNotificationRuleMutationVariables,
        Integration,
        NotificationRule,
        NotificationRuleInput,
        PutNotificationRuleMutationVariables,
    } from '@graphql/api';
    import {deleteNotificationRule, putNotificationRule} from '@graphql/mutations';
    import {listIntegrations, listNotificationRules} from '@graphql/queries';
    import {generateClient, type GraphQLQuery} from 'aws-amplify/api';
    import {reactive, ref} from 'vue';

    const client = generateClient();
    const notificationRules = reactive(new Map<string, NotificationRule>());
    const integrations = reactive(new Array());
    const dialog = ref(false);

    type PutNotificationRuleResponse = {
        putNotificationRule: NotificationRule;
    };

    type ListIntegrationsResponse = {
        listIntegrations: Integration[];
    };

    type DeleteNotificationRuleResponse = {
        deleteNotificationRule: boolean;
    };

    const handlePutNotificationRule = async (putNotificationRuleInput: NotificationRuleInput) => {
        try {
            const variables: PutNotificationRuleMutationVariables = {input: putNotificationRuleInput};
            const response = await client.graphql<GraphQLQuery<PutNotificationRuleResponse>>({
                query: putNotificationRule,
                variables,
            });
            notificationRules.set(
                `${response.data.putNotificationRule.integrationId}-${response.data.putNotificationRule.owner}/${response.data.putNotificationRule.repository_name}/${response.data.putNotificationRule.workflow_name}`,
                response.data.putNotificationRule,
            );
        } catch (error) {
            console.error(error);
        }
    };

    type ListNotificationRulesResponse = {
        listNotificationRules: {
            items: NotificationRule[];
        };
    };

    const handleListNotificationRules = async () => {
        try {
            const [notificationRulesResponse, integrationsResponse] = await Promise.allSettled([
                client.graphql<GraphQLQuery<ListNotificationRulesResponse>>({
                    query: listNotificationRules,
                }),
                client.graphql<GraphQLQuery<ListIntegrationsResponse>>({
                    query: listIntegrations,
                }),
            ]);

            if (notificationRulesResponse.status !== 'fulfilled') {
                throw new Error(notificationRulesResponse.reason);
            }

            if (integrationsResponse.status !== 'fulfilled') {
                throw new Error(integrationsResponse.reason);
            }

            notificationRulesResponse.value.data.listNotificationRules.items?.forEach((notificationRule: NotificationRule) => {
                notificationRules.set(
                    `${notificationRule.integrationId}-${notificationRule.owner}/${notificationRule.repository_name}/${notificationRule.workflow_name}`,
                    notificationRule,
                );
            });

            integrations.push(...integrationsResponse.value.data.listIntegrations);
        } catch (error) {
            console.error(error);
        }
    };

    handleListNotificationRules();

    const onSave = async (notificationRuleInput: NotificationRuleInput) => {
        await handlePutNotificationRule(notificationRuleInput);
        dialog.value = false;
    };

    const handleDeleteNotificationRule = async (integrationId: string, id: string) => {
        try {
            const variables: DeleteNotificationRuleMutationVariables = {integrationId, id};
            await client.graphql<GraphQLQuery<DeleteNotificationRuleResponse>>({
                query: deleteNotificationRule,
                variables,
            });
        } catch (error) {
            console.error(error);
        }

        const notificationRuleToDelete = Array.from(notificationRules.values()).find((rule) => rule.id === id);
        if (notificationRuleToDelete) {
            // Remove from the reactive map
            notificationRules.delete(
                `${notificationRuleToDelete.integrationId}-${notificationRuleToDelete.owner}/${notificationRuleToDelete.repository_name}/${notificationRuleToDelete.workflow_name}`,
            );
        }
    };
</script>

<template>
    <v-main>
        <v-row
            align="start"
            v-for="[key, notificationRule] in notificationRules"
            :key="key"
            no-gutters
        >
            <NotificationCard
                :notificationRule="notificationRule"
                :integrations="integrations"
                :onDelete="handleDeleteNotificationRule"
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
                <NotificationDetailsCard
                    v-if="dialog"
                    :onClose="() => (dialog = false)"
                    :integrations="integrations"
                    :onSave="onSave"
                />
            </v-dialog>
        </v-bottom-navigation>
    </v-main>
</template>

<style scoped></style>
