<script setup lang="ts">
    import {APP_INFO} from '@/components/apps/appCatalog';
    import Button from '@/components/ui/Button.vue';
    import Checkbox from '@/components/ui/Checkbox.vue';
    import Input from '@/components/ui/Input.vue';
    import Label from '@/components/ui/Label.vue';
    import Switch from '@/components/ui/Switch.vue';
    import {useIntegrationApps} from '@/composables/useIntegrationApps';
    import type {Integration, IntegrationApp, NotificationHandle, NotificationRule} from '@common/types';
    import {ChevronDown, X} from '@lucide/vue';
    import {computed, ref, watch} from 'vue';
    import {RouterLink} from 'vue-router';

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
        label: '',
        enabled: false,
        createdAt: '',
        updatedAt: '',
        ignore_dependabot: false,
        include_log_details: true,
        rule: {owner: '', repository_name: '', workflow_name: '', head_branch: '', topics: []},
        handleIds: [],
    });

    const notificationRule = ref<NotificationRule>(createDefaultRule());

    const {listApps} = useIntegrationApps();

    const apps = ref<IntegrationApp[]>([]);
    const isLoadingApps = ref(false);
    const appsError = ref('');
    const selectedAppId = ref('');
    let appsRequest = 0;

    const selectClass =
        'flex h-9 w-full rounded-lg border border-border bg-input-background px-3 pr-8 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50';

    const HANDLE_REQUIRED = 'Notification handle is required';
    const errorMsg = ref('');
    const handleInvalid = computed(() => errorMsg.value === HANDLE_REQUIRED);
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

    const handleApps = computed(() =>
        apps.value.flatMap((app) => ('handles' in app && app.handles.length > 0 ? [{appId: app.appId, type: app.type, handles: app.handles}] : [])),
    );
    const handlesOfSelectedApp = computed<NotificationHandle[]>(
        () => handleApps.value.find((app) => app.appId === selectedAppId.value)?.handles ?? [],
    );
    const selectedHandleId = computed(() => (notificationRule.value.handleIds.length === 1 ? notificationRule.value.handleIds[0] : ''));
    const hasSeveralHandles = computed(() => notificationRule.value.handleIds.length > 1);
    const currentHandleNames = computed(() => {
        const byId = new Map(handleApps.value.flatMap((app) => app.handles.map((h) => [h.handleId, h.name] as const)));
        return notificationRule.value.handleIds.map((id) => byId.get(id) ?? 'Unknown handle').join(', ');
    });
    const hasDestinationChoice = computed(() => handleApps.value.length > 0);
    const needsApps = computed(
        () => !!notificationRule.value.integrationId && !isLoadingApps.value && !appsError.value && !hasDestinationChoice.value,
    );

    const loadApps = async (integrationId: string) => {
        const request = ++appsRequest;
        apps.value = [];
        appsError.value = '';
        selectedAppId.value = '';
        if (!integrationId) return;
        isLoadingApps.value = true;
        try {
            const loaded = await listApps(integrationId);
            if (request !== appsRequest) return;
            apps.value = loaded;
            const withHandles = handleApps.value;
            const current = withHandles.find((app) => app.handles.some((h) => h.handleId === notificationRule.value.handleIds[0]));
            selectedAppId.value = current?.appId ?? (withHandles.length === 1 ? withHandles[0].appId : '');
        } catch {
            if (request !== appsRequest) return;
            appsError.value = 'Failed to load notification handles. Please try again.';
        } finally {
            if (request === appsRequest) isLoadingApps.value = false;
        }
    };

    watch(() => notificationRule.value.integrationId, loadApps, {immediate: true});

    const onIntegrationChange = () => {
        notificationRule.value.handleIds = [];
    };

    const onAppChange = () => {
        notificationRule.value.handleIds = [];
    };

    const onHandleChange = (event: Event) => {
        const handleId = (event.target as HTMLSelectElement).value;
        notificationRule.value.handleIds = handleId ? [handleId] : [];
    };

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
        if (!notificationRule.value.label.trim()) {
            errorMsg.value = 'Label is required';
            return;
        }
        if (!notificationRule.value.integrationId) {
            errorMsg.value = 'Integration is required';
            return;
        }
        if (notificationRule.value.handleIds.length === 0) {
            errorMsg.value = HANDLE_REQUIRED;
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
                <Label>Label *</Label>
                <Input
                    v-model="notificationRule.label"
                    placeholder="e.g., Team Alpha CI alerts"
                    maxlength="100"
                />
            </div>

            <div class="space-y-2">
                <Label>Integration *</Label>
                <div class="relative">
                    <select
                        v-model="notificationRule.integrationId"
                        @change="onIntegrationChange"
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
                        placeholder="e.g., main"
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

            <div class="space-y-1">
                <div class="flex items-center gap-2">
                    <Checkbox
                        v-model="notificationRule.include_log_details"
                        id="include-log-details"
                        aria-describedby="include-log-details-hint"
                    />
                    <Label
                        for="include-log-details"
                        class="cursor-pointer"
                        >Include log details (error lines and AI summary)</Label
                    >
                </div>
                <p
                    id="include-log-details-hint"
                    class="text-xs text-muted-foreground"
                >
                    Everyone in the Slack channel will see error lines from the job log. Requires the GitGazer GitHub App.
                </p>
            </div>

            <fieldset
                v-if="notificationRule.integrationId"
                class="space-y-2"
            >
                <legend class="text-sm font-medium">Destination *</legend>
                <p
                    v-if="isLoadingApps"
                    class="text-xs text-muted-foreground"
                >
                    Loading notification handles...
                </p>
                <p
                    v-else-if="appsError"
                    role="alert"
                    class="text-xs text-destructive"
                >
                    {{ appsError }}
                </p>
                <p
                    v-else-if="needsApps"
                    class="text-sm text-muted-foreground"
                >
                    This integration has no notification handles yet.
                    <RouterLink
                        :to="`/integrations/${notificationRule.integrationId}/apps`"
                        class="underline text-foreground"
                        >Add a handle in the Apps tab</RouterLink
                    >
                    to send alerts.
                </p>
                <template v-else>
                    <p
                        v-if="existingRule && notificationRule.handleIds.length === 0"
                        class="text-xs text-yellow-800 dark:text-yellow-400"
                    >
                        This rule has no destination, so it sends no alerts. Select a handle to fix that.
                    </p>
                    <p
                        v-if="hasSeveralHandles"
                        class="text-xs text-muted-foreground"
                    >
                        Currently sends to {{ currentHandleNames }}. Selecting a handle below replaces them.
                    </p>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div class="space-y-2">
                            <Label for="notification-app">App</Label>
                            <div class="relative">
                                <select
                                    id="notification-app"
                                    v-model="selectedAppId"
                                    :class="selectClass"
                                    @change="onAppChange"
                                >
                                    <option
                                        value=""
                                        disabled
                                    >
                                        Select app
                                    </option>
                                    <option
                                        v-for="app in handleApps"
                                        :key="app.appId"
                                        :value="app.appId"
                                    >
                                        {{ APP_INFO[app.type].name }}
                                    </option>
                                </select>
                                <ChevronDown class="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                            </div>
                        </div>
                        <div class="space-y-2">
                            <Label for="notification-handle">Handle</Label>
                            <div class="relative">
                                <select
                                    id="notification-handle"
                                    :value="selectedHandleId"
                                    :disabled="!selectedAppId"
                                    :aria-invalid="handleInvalid"
                                    :aria-describedby="handleInvalid ? 'notification-error' : undefined"
                                    :class="selectClass"
                                    @change="onHandleChange"
                                >
                                    <option
                                        value=""
                                        disabled
                                    >
                                        Select handle
                                    </option>
                                    <option
                                        v-for="handle in handlesOfSelectedApp"
                                        :key="handle.handleId"
                                        :value="handle.handleId"
                                    >
                                        {{ handle.name }}
                                    </option>
                                </select>
                                <ChevronDown class="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                            </div>
                        </div>
                    </div>
                </template>
            </fieldset>

            <div class="flex items-center gap-3">
                <Switch v-model="notificationRule.enabled" />
                <Label>Enabled</Label>
            </div>

            <p
                v-if="errorMsg || saveError"
                id="notification-error"
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
                :disabled="needsApps"
                @click="handleSave"
                >Save</Button
            >
        </div>
    </div>
</template>
