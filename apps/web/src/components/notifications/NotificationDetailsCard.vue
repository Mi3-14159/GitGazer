<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Checkbox from '@/components/ui/Checkbox.vue';
    import Input from '@/components/ui/Input.vue';
    import Label from '@/components/ui/Label.vue';
    import Switch from '@/components/ui/Switch.vue';
    import {Integration, NotificationRule, NotificationRuleChannelType} from '@common/types';
    import {ChevronDown, X} from 'lucide-vue-next';
    import {computed, ref, watch} from 'vue';

    const props = defineProps<{
        integrations: Integration[];
        onClose: () => void;
        onSave: (notificationRule: NotificationRule) => void | Promise<void>;
        existingRule?: NotificationRule | null;
        isSaving?: boolean;
        saveError?: string;
    }>();

    const createDefaultRule = (): NotificationRule => ({
        id: '',
        integrationId: '',
        enabled: false,
        createdAt: '',
        updatedAt: '',
        ignore_dependabot: false,
        rule: {owner: '', repository_name: '', workflow_name: '', head_branch: '', topics: []},
        channels: [{type: NotificationRuleChannelType.SLACK, webhook_url: ''}],
    });

    const notificationRule = ref<NotificationRule>(createDefaultRule());

    const errorMsg = ref('');
    const topicInput = ref('');

    watch(
        () => props.existingRule,
        (rule) => {
            if (rule) {
                notificationRule.value = {
                    ...rule,
                    rule: {...rule.rule, topics: rule.rule.topics ?? []},
                };
            } else {
                notificationRule.value = createDefaultRule();
            }
            topicInput.value = '';
            errorMsg.value = '';
        },
        {immediate: true},
    );

    const topics = computed(() => notificationRule.value.rule.topics ?? []);

    const addTopic = () => {
        const topic = topicInput.value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '');
        if (topic && !topics.value.includes(topic) && topics.value.length < 50) {
            notificationRule.value.rule.topics = [...topics.value, topic];
        }
        topicInput.value = '';
    };

    const removeTopic = (topic: string) => {
        notificationRule.value.rule.topics = topics.value.filter((t) => t !== topic);
    };

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
                <div class="relative">
                    <select
                        v-model="notificationRule.integrationId"
                        class="flex h-9 w-full rounded-lg border border-border bg-input-background px-3 pr-8 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring appearance-none cursor-pointer"
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
                    <ChevronDown class="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
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

            <div class="space-y-2">
                <Label>Topics</Label>
                <div class="flex gap-2">
                    <Input
                        v-model="topicInput"
                        placeholder="e.g., frontend, backend"
                        @keydown.enter.prevent="addTopic"
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        @click="addTopic"
                    >
                        Add
                    </Button>
                </div>
                <div
                    v-if="topics.length > 0"
                    class="flex flex-wrap gap-1 mt-1"
                >
                    <span
                        v-for="topic in topics"
                        :key="topic"
                        class="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium"
                    >
                        {{ topic }}
                        <button
                            type="button"
                            class="text-muted-foreground hover:text-foreground"
                            @click="removeTopic(topic)"
                        >
                            <X class="h-3 w-3" />
                        </button>
                    </span>
                </div>
                <p class="text-xs text-muted-foreground">Filter by repository topics. Leave empty to match all.</p>
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
                v-if="errorMsg || saveError"
                class="text-xs text-destructive"
            >
                {{ errorMsg || saveError }}
            </p>
            <p class="text-xs text-muted-foreground">* indicates required field</p>
        </div>
        <div class="flex justify-end gap-2 mt-6 pt-4 border-t">
            <Button
                variant="outline"
                :disabled="isSaving"
                @click="props.onClose"
                >Close</Button
            >
            <Button
                :loading="isSaving"
                @click="handleSave"
                >Save</Button
            >
        </div>
    </div>
</template>
