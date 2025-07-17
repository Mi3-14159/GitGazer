<script setup lang="ts">
    import type {Integration, NotificationRule} from '@graphql/api';

    const props = defineProps<{
        notificationRule: NotificationRule;
        integrations: Integration[];
        onDelete: (integrationId: string, id: string) => void;
    }>();

    const parseOptional = (value: string | null | undefined): string => {
        switch (value) {
            case null:
            case undefined:
            case '*':
                return 'All';
            default:
                return value;
        }
    };

    const getIntegrationLabel = (integrationId: string): string => {
        const integration = props.integrations.find((i) => i.id === integrationId);
        return integration ? integration.label : integrationId;
    };
</script>

<template>
    <v-card
        class="ma-2 rounded-lg"
        style="min-width: 300px"
    >
        <v-card-text>
            <tbody class="notification-table">
                <tr>
                    <td>Integration:</td>
                    <td>{{ getIntegrationLabel(props.notificationRule.integrationId) }}</td>
                </tr>
                <tr>
                    <td>Owner:</td>
                    <td>{{ parseOptional(props.notificationRule.owner) }}</td>
                </tr>
                <tr>
                    <td>Repository:</td>
                    <td>{{ parseOptional(props.notificationRule.repository_name) }}</td>
                </tr>
                <tr>
                    <td>Workflow:</td>
                    <td>{{ parseOptional(props.notificationRule.workflow_name) }}</td>
                </tr>
                <tr>
                    <td>Branch:</td>
                    <td>{{ parseOptional(props.notificationRule.head_branch) }}</td>
                </tr>
                <tr>
                    <td>Enabled:</td>
                    <td>
                        <v-chip
                            :color="props.notificationRule.enabled ? 'green' : 'red'"
                            size="small"
                            density="compact"
                        >
                            {{ props.notificationRule.enabled ? 'Yes' : 'No' }}
                        </v-chip>
                    </td>
                </tr>
                <tr>
                    <td>Channels:</td>
                    <td>{{ props.notificationRule.channels.length }} channel(s)</td>
                </tr>
                <tr>
                    <td>Created:</td>
                    <td>{{ new Date(props.notificationRule.created_at).toLocaleString() }}</td>
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
                            Do you really want to delete this notification rule? This is irreversible and will stop notifications for this rule!
                        </v-card-text>
                        <v-card-actions>
                            <v-btn
                                text="Yes, delete"
                                color="error"
                                @click="
                                    onDelete(props.notificationRule.integrationId, props.notificationRule.id);
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
    .notification-table td {
        padding: 2px 8px;
        vertical-align: top;
    }

    .notification-table td:first-child {
        font-weight: 500;
        color: rgba(var(--v-theme-on-surface), 0.87);
        width: 30%;
    }

    .notification-table td:last-child {
        color: rgba(var(--v-theme-on-surface), 0.6);
    }
</style>
