<script setup lang="ts">
    import {NotificationChannelType, NotificationRuleInput} from '@graphql/api';
    import {ref} from 'vue';

    const props = defineProps<{
        integrations: string[];
        onClose: () => void;
        onSave: (notificationRuleInput: NotificationRuleInput) => void;
    }>();

    const notificationRule = ref<NotificationRuleInput>({
        owner: '',
        repository_name: '',
        workflow_name: '',
        integrationId: '',
        enabled: false,
        channels: [
            {
                type: NotificationChannelType.SLACK,
                webhook_url: '',
            },
        ],
    });
</script>
<template>
    <v-card
        prepend-icon="mdi-bell"
        title="Notification rule"
    >
        <v-card-text>
            <v-row dense>
                <v-col
                    sm="12
                    "
                >
                    <v-autocomplete
                        :items="integrations"
                        label="Integrations*"
                        auto-select-first
                        v-model="notificationRule.integrationId"
                    ></v-autocomplete>
                </v-col>

                <v-col
                    cols="12"
                    md="4"
                    sm="6"
                >
                    <v-text-field
                        label="Owner*"
                        v-model="notificationRule.owner"
                        required
                    ></v-text-field>
                </v-col>

                <v-col
                    cols="12"
                    md="4"
                    sm="6"
                >
                    <v-text-field
                        label="Repository name"
                        v-model="notificationRule.repository_name"
                    ></v-text-field>
                </v-col>

                <v-col
                    cols="12"
                    md="4"
                    sm="6"
                >
                    <v-text-field
                        label="Workflow name"
                        v-model="notificationRule.workflow_name"
                    ></v-text-field>
                </v-col>

                <v-divider></v-divider>

                <v-col sm="12">
                    <v-text-field
                        v-if="notificationRule.channels[0]?.type === NotificationChannelType.SLACK"
                        label="Slack Webhook URL*"
                        v-model="notificationRule.channels[0].webhook_url"
                        required
                    ></v-text-field>
                </v-col>

                <v-divider></v-divider>

                <v-col
                    cols="12"
                    md="4"
                    sm="6"
                >
                    <v-checkbox
                        label="Enabled"
                        v-model="notificationRule.enabled"
                    ></v-checkbox>
                </v-col>
            </v-row>

            <small class="text-caption text-medium-emphasis">*indicates required field</small>
        </v-card-text>
        <v-divider></v-divider>
        <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn
                text="Close"
                variant="plain"
                @click="props.onClose"
            ></v-btn>
            <v-btn
                color="primary"
                text="Save"
                variant="tonal"
                @click="props.onSave(notificationRule)"
            ></v-btn>
        </v-card-actions>
    </v-card>
</template>
