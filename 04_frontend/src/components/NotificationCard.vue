<script setup lang="ts">
    import type {Integration, NotificationRule} from '@graphql/api';

    const props = defineProps<{
        notificationRule: NotificationRule;
        integrations: Integration[];
        onDelete: (integrationId: string, id: string) => void;
        onEdit: (notificationRule: NotificationRule) => void;
    }>();

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
        const integration = props.integrations.find((i) => i.id === integrationId);
        return integration ? integration.label : integrationId;
    };
</script>

<template>
    <v-card
        class="ma-2 rounded-lg"
        style="width: 100%"
    >
        <v-card-title>{{ getIntegrationLabel(props.notificationRule.integrationId) }}</v-card-title>
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
                        Owner:
                    </v-col>
                    <v-col
                        cols="8"
                        class="field-value"
                    >
                        {{ parseOptional(props.notificationRule.owner) }}
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
                        Repository:
                    </v-col>
                    <v-col
                        cols="8"
                        class="field-value"
                    >
                        {{ parseOptional(props.notificationRule.repository_name) }}
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
                        Workflow:
                    </v-col>
                    <v-col
                        cols="8"
                        class="field-value"
                    >
                        {{ parseOptional(props.notificationRule.workflow_name) }}
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
                        Branch:
                    </v-col>
                    <v-col
                        cols="8"
                        class="field-value"
                    >
                        {{ parseOptional(props.notificationRule.head_branch) }}
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
                        Enabled:
                    </v-col>
                    <v-col
                        cols="8"
                        class="field-value"
                    >
                        <v-chip
                            :color="props.notificationRule.enabled ? 'green' : 'red'"
                            size="small"
                            density="compact"
                        >
                            {{ props.notificationRule.enabled ? 'Yes' : 'No' }}
                        </v-chip>
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
                        Channels:
                    </v-col>
                    <v-col
                        cols="8"
                        class="field-value"
                    >
                        {{ props.notificationRule.channels.length }} channel(s)
                    </v-col>
                </v-row>
                <v-row no-gutters>
                    <v-col
                        cols="4"
                        class="field-label"
                    >
                        Created:
                    </v-col>
                    <v-col
                        cols="8"
                        class="field-value"
                    >
                        {{ new Date(props.notificationRule.created_at).toLocaleString() }}
                    </v-col>
                </v-row>
            </v-container>
        </v-card-text>
        <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn
                color="primary"
                text="edit"
                variant="text"
                @click="props.onEdit(props.notificationRule)"
            ></v-btn>
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
                        <v-card-title>Delete Notification Rule</v-card-title>
                        <v-card-text>
                            Do you really want to delete this notification rule? This is irreversible and will stop notifications for this rule!
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
</style>
