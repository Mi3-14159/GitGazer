<script setup lang="ts">
    import {Integration, NotificationChannelType, NotificationRule, NotificationRuleInput} from '@graphql/api';
    import {onMounted, ref} from 'vue';

    const props = defineProps<{
        integrations: Integration[];
        onClose: () => void;
        onSave: (notificationRuleInput: NotificationRuleInput) => void;
        existingRule?: NotificationRule | null;
    }>();

    const form = ref<any>(null);

    const notificationRule = ref<NotificationRuleInput>({
        owner: '',
        repository_name: '',
        workflow_name: '',
        head_branch: '',
        integrationId: '',
        enabled: false,
        channels: [
            {
                type: NotificationChannelType.SLACK,
                webhook_url: '',
            },
        ],
    });

    // Populate form with existing data if editing
    onMounted(() => {
        if (props.existingRule) {
            notificationRule.value = {
                integrationId: props.existingRule.integrationId,
                owner: props.existingRule.owner || '',
                repository_name: props.existingRule.repository_name || '',
                workflow_name: props.existingRule.workflow_name || '',
                head_branch: props.existingRule.head_branch || '',
                enabled: props.existingRule.enabled,
                channels: props.existingRule.channels.map((channel) => ({
                    type: channel?.type || NotificationChannelType.SLACK,
                    webhook_url: channel?.webhook_url || '',
                })),
                ignore_dependabot: props.existingRule.ignore_dependabot,
            };
        }
    });

    const handleSave = async () => {
        const {valid} = await form.value.validate();
        if (valid) {
            props.onSave(notificationRule.value);
        }
    };
</script>
<template>
    <v-card
        prepend-icon="mdi-bell"
        :title="props.existingRule ? 'Edit Notification Rule' : 'New Notification Rule'"
    >
        <v-form ref="form">
            <v-card-text>
                <v-row dense>
                    <v-col sm="12">
                        <v-autocomplete
                            :items="integrations"
                            item-title="label"
                            item-value="id"
                            label="Integrations *"
                            auto-select-first
                            v-model="notificationRule.integrationId"
                            :rules="[(v) => !!v || 'Integration is required']"
                            required
                        ></v-autocomplete>
                    </v-col>

                    <v-col
                        cols="12"
                        md="4"
                        sm="6"
                    >
                        <v-text-field
                            label="Owner"
                            v-model="notificationRule.owner"
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

                    <v-col
                        cols="12"
                        md="4"
                        sm="6"
                    >
                        <v-text-field
                            label="Head branch"
                            v-model="notificationRule.head_branch"
                            placeholder="e.g., main, master, feature/*"
                        ></v-text-field>
                    </v-col>

                    <v-col
                        cols="12"
                        md="4"
                        sm="6"
                    >
                        <v-autocomplete
                            :items="[true, false]"
                            item-title=""
                            item-value=""
                            label="Ignore Dependabot"
                            auto-select-first
                            v-model="notificationRule.ignore_dependabot"
                        ></v-autocomplete>
                    </v-col>

                    <v-col sm="12">
                        <v-text-field
                            v-if="notificationRule.channels[0]?.type === NotificationChannelType.SLACK"
                            label="Slack Webhook URL *"
                            v-model="notificationRule.channels[0].webhook_url"
                            :rules="[(v) => !!v || 'Slack Webhook URL is required']"
                            required
                        ></v-text-field>
                    </v-col>

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
        </v-form>
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
                @click="handleSave"
            ></v-btn>
        </v-card-actions>
    </v-card>
</template>
