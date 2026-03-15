<script setup lang="ts">
    import NotificationDetailsCard from '@/components/NotificationDetailsCard.vue';
    import Badge from '@/components/ui/Badge.vue';
    import Button from '@/components/ui/Button.vue';
    import Card from '@/components/ui/Card.vue';
    import CardContent from '@/components/ui/CardContent.vue';
    import Dialog from '@/components/ui/Dialog.vue';
    import Input from '@/components/ui/Input.vue';
    import Skeleton from '@/components/ui/Skeleton.vue';
    import Switch from '@/components/ui/Switch.vue';
    import {useIntegration} from '@/composables/useIntegration';
    import {useNotification} from '@/composables/useNotification';
    import type {Integration, NotificationRule} from '@common/types';
    import {Bell, Calendar, CheckCircle2, Copy, Eye, EyeOff, Filter, Pencil, Plus, Trash2, XCircle} from 'lucide-vue-next';
    import {onMounted, ref} from 'vue';

    const {getNotifications, isLoadingNotifications, upsertNotification, deleteNotification} = useNotification();
    const {getIntegrations} = useIntegration();

    const notifications = ref<NotificationRule[]>([]);
    const integrations = ref<Integration[]>([]);
    const showDialog = ref(false);
    const editingRule = ref<NotificationRule | null>(null);
    const showDeleteConfirm = ref(false);
    const deletingRule = ref<NotificationRule | null>(null);
    const showWebhooks = ref<Record<string, boolean>>({});

    onMounted(async () => {
        const [n, i] = await Promise.all([getNotifications(), getIntegrations()]);
        notifications.value = n ?? [];
        integrations.value = i ?? [];
    });

    function openCreate() {
        editingRule.value = null;
        showDialog.value = true;
    }

    function openEdit(rule: NotificationRule) {
        editingRule.value = rule;
        showDialog.value = true;
    }

    function confirmDelete(rule: NotificationRule) {
        deletingRule.value = rule;
        showDeleteConfirm.value = true;
    }

    async function handleSave(rule: NotificationRule) {
        const {channels, enabled, ignore_dependabot, rule: ruleFilter} = rule;
        const saved = await upsertNotification({channels, enabled, ignore_dependabot, rule: ruleFilter}, rule.integrationId, rule.id || undefined);
        if (saved) {
            if (editingRule.value) {
                const idx = notifications.value.findIndex((n) => n.id === saved.id);
                if (idx !== -1) notifications.value[idx] = saved;
            } else {
                notifications.value.push(saved);
            }
        }
        showDialog.value = false;
    }

    async function handleDelete() {
        if (!deletingRule.value?.id) return;
        const ok = await deleteNotification(deletingRule.value.id, deletingRule.value.integrationId);
        if (ok) {
            notifications.value = notifications.value.filter((n) => n.id !== deletingRule.value!.id);
        }
        showDeleteConfirm.value = false;
        deletingRule.value = null;
    }

    async function handleToggleEnabled(rule: NotificationRule) {
        const toggled = {...rule, enabled: !rule.enabled};
        const {channels, enabled, ignore_dependabot, rule: ruleFilter} = toggled;
        const saved = await upsertNotification(
            {channels, enabled, ignore_dependabot, rule: ruleFilter},
            toggled.integrationId,
            toggled.id || undefined,
        );
        if (saved) {
            const idx = notifications.value.findIndex((n) => n.id === saved.id);
            if (idx !== -1) notifications.value[idx] = saved;
        }
    }

    function integrationLabel(id: string) {
        return integrations.value.find((i) => i.integrationId === id)?.label ?? id;
    }

    function hasActiveFilters(rule: NotificationRule) {
        const {rule: r} = rule;
        return !!(r.owner || r.repository_name || r.workflow_name || r.head_branch);
    }

    function toggleWebhookVisibility(id: string) {
        showWebhooks.value = {...showWebhooks.value, [id]: !showWebhooks.value[id]};
    }

    async function copyToClipboard(text: string) {
        await navigator.clipboard.writeText(text);
    }

    function formatDate(dateStr: string) {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return 'today';
        if (diffDays === 1) return 'yesterday';
        if (diffDays < 30) return `${diffDays} days ago`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
        return `${Math.floor(diffDays / 365)} years ago`;
    }
</script>

<template>
    <div class="space-y-6 p-4 md:p-6">
        <!-- Header -->
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
                <Bell class="h-5 w-5 text-muted-foreground" />
                <h2 class="text-lg font-semibold">Notification Rules</h2>
            </div>
            <Button
                size="sm"
                @click="openCreate"
            >
                <Plus class="h-4 w-4" />
                Add Rule
            </Button>
        </div>

        <!-- Loading -->
        <div
            v-if="isLoadingNotifications"
            class="space-y-3"
        >
            <Skeleton class="h-32 w-full rounded-xl" />
            <Skeleton class="h-32 w-full rounded-xl" />
        </div>

        <!-- Empty -->
        <div
            v-else-if="notifications.length === 0"
            class="rounded-xl border bg-card p-8 text-center"
        >
            <Bell class="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p class="mt-2 text-sm text-muted-foreground">No notification rules configured.</p>
            <Button
                size="sm"
                class="mt-4"
                @click="openCreate"
                >Create your first rule</Button
            >
        </div>

        <!-- Card List -->
        <div
            v-else
            class="space-y-3"
        >
            <Card
                v-for="rule in notifications"
                :key="rule.id"
                :class="!rule.enabled ? 'opacity-60' : ''"
            >
                <CardContent class="p-4">
                    <div class="flex items-start justify-between gap-4">
                        <div class="space-y-2 flex-1 min-w-0">
                            <!-- Header Row -->
                            <div class="flex items-center gap-2 flex-wrap">
                                <h3 class="font-semibold text-base">{{ integrationLabel(rule.integrationId) }}</h3>
                                <Badge
                                    v-if="rule.enabled"
                                    variant="success"
                                    class="gap-1 h-5 text-xs"
                                >
                                    <CheckCircle2 class="h-3 w-3" />
                                    Enabled
                                </Badge>
                                <Badge
                                    v-else
                                    variant="secondary"
                                    class="gap-1 h-5 text-xs"
                                >
                                    <XCircle class="h-3 w-3" />
                                    Disabled
                                </Badge>
                                <Badge
                                    v-if="hasActiveFilters(rule)"
                                    variant="outline"
                                    class="gap-1 h-5 text-xs"
                                >
                                    <Filter class="h-3 w-3" />
                                    Filtered
                                </Badge>
                                <Badge
                                    variant="secondary"
                                    class="h-5 text-xs"
                                >
                                    {{ rule.channels[0]?.type ?? '—' }}
                                </Badge>
                            </div>

                            <!-- Webhook & Filters Grid -->
                            <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-1">
                                <!-- Slack Webhook -->
                                <div class="space-y-1">
                                    <div class="text-xs font-medium text-muted-foreground">Slack Webhook</div>
                                    <div class="flex items-center gap-1">
                                        <Input
                                            :model-value="rule.channels[0]?.webhook_url ?? ''"
                                            :type="showWebhooks[rule.id ?? ''] ? 'text' : 'password'"
                                            readonly
                                            class="font-mono text-xs !h-8 !px-2"
                                        />
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            class="h-8 w-8 p-0 shrink-0"
                                            @click="toggleWebhookVisibility(rule.id ?? '')"
                                        >
                                            <EyeOff
                                                v-if="showWebhooks[rule.id ?? '']"
                                                class="h-3 w-3"
                                            />
                                            <Eye
                                                v-else
                                                class="h-3 w-3"
                                            />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            class="h-8 w-8 p-0 shrink-0"
                                            @click="copyToClipboard(rule.channels[0]?.webhook_url ?? '')"
                                        >
                                            <Copy class="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>

                                <!-- Active Filters -->
                                <div
                                    v-if="hasActiveFilters(rule)"
                                    class="space-y-1"
                                >
                                    <div class="text-xs font-medium text-muted-foreground">Active Filters</div>
                                    <div class="flex flex-wrap gap-1">
                                        <Badge
                                            v-if="rule.rule.owner"
                                            variant="outline"
                                            class="text-xs h-5 px-1.5 font-mono"
                                        >
                                            {{ rule.rule.owner }}
                                        </Badge>
                                        <Badge
                                            v-if="rule.rule.repository_name"
                                            variant="outline"
                                            class="text-xs h-5 px-1.5 font-mono"
                                        >
                                            {{ rule.rule.repository_name }}
                                        </Badge>
                                        <Badge
                                            v-if="rule.rule.workflow_name"
                                            variant="secondary"
                                            class="text-xs h-5 px-1.5"
                                        >
                                            {{ rule.rule.workflow_name }}
                                        </Badge>
                                        <Badge
                                            v-if="rule.rule.head_branch"
                                            variant="secondary"
                                            class="text-xs h-5 px-1.5"
                                        >
                                            {{ rule.rule.head_branch }}
                                        </Badge>
                                        <Badge
                                            v-if="rule.ignore_dependabot"
                                            variant="warning"
                                            class="text-xs h-5 px-1.5"
                                        >
                                            No Dependabot
                                        </Badge>
                                    </div>
                                </div>
                            </div>

                            <!-- Timestamps -->
                            <div class="flex items-center gap-3 text-xs text-muted-foreground">
                                <span class="flex items-center gap-1">
                                    <Calendar class="h-3 w-3" />
                                    Created {{ formatDate(rule.createdAt) }}
                                </span>
                                <span
                                    v-if="rule.updatedAt !== rule.createdAt"
                                    class="flex items-center gap-1"
                                >
                                    Updated {{ formatDate(rule.updatedAt) }}
                                </span>
                            </div>
                        </div>

                        <!-- Actions -->
                        <div class="flex items-center gap-1 flex-shrink-0">
                            <Switch
                                :model-value="rule.enabled"
                                @update:model-value="handleToggleEnabled(rule)"
                            />
                            <Button
                                variant="ghost"
                                size="sm"
                                class="h-8 w-8 p-0"
                                @click="openEdit(rule)"
                            >
                                <Pencil class="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                class="h-8 w-8 p-0"
                                @click="confirmDelete(rule)"
                            >
                                <Trash2 class="h-3.5 w-3.5 text-destructive" />
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>

        <!-- Create/Edit Dialog -->
        <Dialog
            :open="showDialog"
            @update:open="showDialog = $event"
        >
            <template #default="{close}">
                <NotificationDetailsCard
                    :integrations="integrations"
                    :existing-rule="editingRule"
                    :on-close="close"
                    :on-save="handleSave"
                />
            </template>
        </Dialog>

        <!-- Delete Confirmation Dialog -->
        <Dialog
            :open="showDeleteConfirm"
            @update:open="showDeleteConfirm = $event"
        >
            <template #default="{close}">
                <h3 class="text-lg font-semibold">Delete Notification Rule</h3>
                <p class="mt-2 text-sm text-muted-foreground">
                    Are you sure you want to delete this notification rule? This action cannot be undone.
                </p>
                <div class="flex justify-end gap-2 mt-6">
                    <Button
                        variant="outline"
                        @click="close"
                        >Cancel</Button
                    >
                    <Button
                        variant="destructive"
                        @click="handleDelete"
                        >Delete</Button
                    >
                </div>
            </template>
        </Dialog>
    </div>
</template>
