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
    import {computed, reactive, ref} from 'vue';
    import {useDisplay} from 'vuetify';

    const client = generateClient();
    const notificationRules = reactive(new Map<string, NotificationRule>());
    const integrations = reactive(new Array());
    const dialog = ref(false);
    const {smAndDown} = useDisplay();

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
                notificationRules.set(`${notificationRule.integrationId}-${notificationRule.id}`, notificationRule);
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
            notificationRules.delete(`${notificationRuleToDelete.integrationId}-${notificationRuleToDelete.id}`);
        }
    };

    const parseOptional = (value: string | null | undefined): string => {
        switch (value) {
            case null:
            case undefined:
            case '*':
            case '':
                return 'any';
            default:
                return value;
        }
    };

    const getIntegrationLabel = (integrationId: string): string => {
        const integration = integrations.find((i) => i.id === integrationId);
        return integration ? integration.label : integrationId;
    };

    const headers = [
        {title: 'Integration', key: 'integration', sortable: true},
        {title: 'Owner', key: 'owner', sortable: true},
        {title: 'Repository', key: 'repository', sortable: true},
        {title: 'Workflow', key: 'workflow', sortable: true},
        {title: 'Branch', key: 'branch', sortable: true},
        {title: 'Enabled', key: 'enabled', sortable: true},
        {title: 'Channels', key: 'channels', sortable: false},
        {title: 'Actions', key: 'actions', sortable: false, align: 'end' as const},
    ];

    const notificationRulesArray = computed(() => {
        return Array.from(notificationRules.values());
    });
</script>

<template>
    <v-main>
        <!-- Desktop Table View -->
        <div v-if="!smAndDown">
            <v-toolbar flat>
                <v-toolbar-title>Notifications</v-toolbar-title>
                <v-spacer></v-spacer>
                <v-dialog
                    v-model="dialog"
                    max-width="600"
                >
                    <template v-slot:activator="{props: activatorProps}">
                        <v-btn
                            prepend-icon="mdi-plus"
                            text="Add Notification Rule"
                            color="primary"
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
            </v-toolbar>

            <v-data-table
                :headers="headers"
                :items="notificationRulesArray"
                item-value="id"
                class="elevation-1"
            >
                <template v-slot:item.integration="{item}">
                    <span class="font-weight-medium">{{ getIntegrationLabel(item.integrationId) }}</span>
                </template>

                <template v-slot:item.owner="{item}">
                    {{ parseOptional(item.owner) }}
                </template>

                <template v-slot:item.repository="{item}">
                    {{ parseOptional(item.repository_name) }}
                </template>

                <template v-slot:item.workflow="{item}">
                    {{ parseOptional(item.workflow_name) }}
                </template>

                <template v-slot:item.branch="{item}">
                    {{ parseOptional(item.head_branch) }}
                </template>

                <template v-slot:item.enabled="{item}">
                    <v-chip
                        :color="item.enabled ? 'green' : 'red'"
                        size="small"
                        density="compact"
                    >
                        {{ item.enabled ? 'Yes' : 'No' }}
                    </v-chip>
                </template>

                <template v-slot:item.channels="{item}"> {{ item.channels.length }} channel(s) </template>

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
                                <v-card-title>Delete Notification Rule</v-card-title>
                                <v-card-text>
                                    Do you really want to delete this notification rule? This is irreversible and will stop notifications for this
                                    rule!
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
                                            handleDeleteNotificationRule(item.integrationId, item.id);
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
        </div>
    </v-main>
</template>

<style scoped></style>
