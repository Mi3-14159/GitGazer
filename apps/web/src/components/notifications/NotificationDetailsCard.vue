<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Checkbox from '@/components/ui/Checkbox.vue';
    import Input from '@/components/ui/Input.vue';
    import Label from '@/components/ui/Label.vue';
    import Switch from '@/components/ui/Switch.vue';
    import {Integration, NotificationRule, NotificationRuleChannelType} from '@common/types';
    import {onMounted, ref} from 'vue';

    const props = defineProps<{
        integrations: Integration[];
        onClose: () => void;
        onSave: (notificationRule: NotificationRule) => void;
        existingRule?: NotificationRule | null;
    }>();

    const notificationRule = ref<NotificationRule>({
        id: '',
        integrationId: '',
        enabled: false,
        createdAt: '',
        updatedAt: '',
        ignore_dependabot: false,
        rule: {owner: '', repository_name: '', workflow_name: '', head_branch: ''},
        channels: [{type: NotificationRuleChannelType.SLACK, webhook_url: ''}],
    });

    onMounted(() => {
        if (props.existingRule) {
            notificationRule.value = {...props.existingRule};
        }
    });

    const errorMsg = ref('');

    const handleSave = () => {
        if (!notificationRule.value.integrationId) {
            errorMsg.value = 'Integration is required';
            return;
        }
        if (notificationRule.value.channels[0]?.type === NotificationRuleChannelType.SLACK && !notificationRule.value.channels[0].webhook_url) {
            errorMsg.value = 'Slack Webhook URL is required';
            return;
        }
        errorMsg.value = '';
        props.onSave(notificationRule.value);
    };
</script>

<template>
    <div>
        <h3 class="text-lg font-semibold mb-4">{{ props.existingRule ? 'Edit Notification Rule' : 'New Notification Rule' }}</h3>
        <div class="space-y-4">
            <div class="space-y-2">
                <Label>Integration *</Label>
                <select
                    v-model="notificationRule.integrationId"
                    class="w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                    <option
                        value=""
                        disabled
                    >
                        Select integration
                    </option>
                    <option
                        v-for="i in integrations"
                        :key="i.integrationId"
                        :value="i.integrationId"
                    >
                        {{ i.label }}
                    </option>
                </select>
            </div>

            <div class="grid grid-cols-2 gap-3">
                <div class="space-y-2">
                    <Label>Owner</Label>
                    <Input
                        v-model="notificationRule.rule.owner"
                        placeholder="e.g., org-name"
                    />
                </div>
                <div class="space-y-2">
                    <Label>Repository name</Label>
                    <Input
                        v-model="notificationRule.rule.repository_name"
                        placeholder="e.g., my-repo"
                    />
                </div>
                <div class="space-y-2">
                    <Label>Workflow name</Label>
                    <Input
                        v-model="notificationRule.rule.workflow_name"
                        placeholder="e.g., CI"
                    />
                </div>
                <div class="space-y-2">
                    <Label>Head branch</Label>
                    <Input
                        v-model="notificationRule.rule.head_branch"
                        placeholder="e.g., main, feature/*"
                    />
                </div>
            </div>

            <div class="flex items-center gap-2">
                <Checkbox
                    v-model="notificationRule.ignore_dependabot"
                    id="ignore-dep"
                />
                <Label
                    for="ignore-dep"
                    class="cursor-pointer"
                    >Ignore Dependabot</Label
                >
            </div>

            <div
                v-if="notificationRule.channels[0]?.type === NotificationRuleChannelType.SLACK"
                class="space-y-2"
            >
                <Label>Slack Webhook URL *</Label>
                <Input
                    v-model="notificationRule.channels[0].webhook_url"
                    placeholder="https://hooks.slack.com/..."
                />
            </div>

            <div class="flex items-center gap-3">
                <Switch v-model="notificationRule.enabled" />
                <Label>Enabled</Label>
            </div>

            <p
                v-if="errorMsg"
                class="text-xs text-destructive"
            >
                {{ errorMsg }}
            </p>
            <p class="text-xs text-muted-foreground">* indicates required field</p>
        </div>
        <div class="flex justify-end gap-2 mt-6 pt-4 border-t">
            <Button
                variant="outline"
                @click="props.onClose"
                >Close</Button
            >
            <Button @click="handleSave">Save</Button>
        </div>
    </div>
</template>
