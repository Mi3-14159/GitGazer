<script setup lang="ts">
    import DeleteNotificationDialog from '@/components/notifications/DeleteNotificationDialog.vue';
    import NotificationCard from '@/components/notifications/NotificationCard.vue';
    import NotificationDetailsCard from '@/components/notifications/NotificationDetailsCard.vue';
    import PageHeader from '@/components/PageHeader.vue';
    import Button from '@/components/ui/Button.vue';
    import Dialog from '@/components/ui/Dialog.vue';
    import EmptyState from '@/components/ui/EmptyState.vue';
    import Skeleton from '@/components/ui/Skeleton.vue';
    import {useIntegration} from '@/composables/useIntegration';
    import {useNotification} from '@/composables/useNotification';
    import type {IntegrationWithRole, NotificationRule} from '@common/types';
    import {hasRole} from '@common/types';
    import {Bell, Plus} from 'lucide-vue-next';
    import {computed, onMounted, ref} from 'vue';

    const {getNotifications, isLoadingNotifications, upsertNotification, deleteNotification} = useNotification();
    const {getIntegrations} = useIntegration();

    const notifications = ref<NotificationRule[]>([]);
    const integrations = ref<IntegrationWithRole[]>([]);
    const showDialog = ref(false);
    const editingRule = ref<NotificationRule | null>(null);
    const showDeleteConfirm = ref(false);
    const deletingRule = ref<NotificationRule | null>(null);
    const isSaving = ref(false);
    const togglingIds = ref(new Set<string>());
    const saveError = ref('');

    function openCreate() {
        editingRule.value = null;
        saveError.value = '';
        showDialog.value = true;
    }

    function openEdit(rule: NotificationRule) {
        editingRule.value = rule;
        saveError.value = '';
        showDialog.value = true;
    }

    function confirmDelete(rule: NotificationRule) {
        deletingRule.value = rule;
        showDeleteConfirm.value = true;
    }

    async function handleSave(rule: NotificationRule) {
        isSaving.value = true;
        saveError.value = '';
        try {
            const {label, channels, enabled, ignore_dependabot, rule: ruleFilter} = rule;
            const saved = await upsertNotification(
                {label, channels, enabled, ignore_dependabot, rule: ruleFilter},
                rule.integrationId,
                rule.id || undefined,
            );
            if (saved) {
                if (editingRule.value) {
                    const idx = notifications.value.findIndex((n) => n.id === saved.id);
                    if (idx !== -1) notifications.value[idx] = saved;
                } else {
                    notifications.value.push(saved);
                }
            }
            showDialog.value = false;
        } catch {
            saveError.value = 'Failed to save notification rule. Please try again.';
        } finally {
            isSaving.value = false;
        }
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
        if (!rule.id || togglingIds.value.has(rule.id)) return;

        const idx = notifications.value.findIndex((n) => n.id === rule.id);
        if (idx === -1) return;

        togglingIds.value.add(rule.id);

        // Optimistic update: flip immediately
        const previousEnabled = rule.enabled;
        notifications.value[idx] = {...rule, enabled: !previousEnabled};

        try {
            const {label, channels, ignore_dependabot, rule: ruleFilter} = rule;
            const saved = await upsertNotification(
                {label, channels, enabled: !previousEnabled, ignore_dependabot, rule: ruleFilter},
                rule.integrationId,
                rule.id || undefined,
            );
            if (saved) {
                notifications.value[idx] = saved;
            }
        } catch {
            // Revert on failure
            notifications.value[idx] = {...notifications.value[idx], enabled: previousEnabled};
        } finally {
            togglingIds.value.delete(rule.id);
        }
    }

    function integrationLabel(id: string) {
        return integrations.value.find((i) => i.integrationId === id)?.label ?? id;
    }

    function canManageNotification(integrationId: string): boolean {
        const integration = integrations.value.find((i) => i.integrationId === integrationId);
        return !!integration && hasRole(integration.role, 'member');
    }

    const canCreateNotification = computed(() => integrations.value.some((i) => hasRole(i.role, 'member')));

    onMounted(async () => {
        const [n, i] = await Promise.all([getNotifications(), getIntegrations()]);
        notifications.value = n ?? [];
        integrations.value = i ?? [];
    });
</script>

<template>
    <div
        data-tour="notifications-content"
        class="space-y-4 p-4"
    >
        <!-- Header -->
        <PageHeader description="Configure Slack webhooks to receive alerts about workflow status changes">
            <Button
                v-if="canCreateNotification"
                size="sm"
                @click="openCreate"
            >
                <Plus class="h-4 w-4" />
                Add Rule
            </Button>
        </PageHeader>

        <!-- Loading -->
        <div
            v-if="isLoadingNotifications"
            class="space-y-3"
        >
            <Skeleton class="h-32 w-full rounded-xl" />
            <Skeleton class="h-32 w-full rounded-xl" />
        </div>

        <!-- Empty -->
        <EmptyState
            v-else-if="notifications.length === 0"
            :icon="Bell"
            :message="
                canCreateNotification
                    ? 'No notification rules configured.'
                    : 'No notification rules configured. You need at least member access to create rules.'
            "
            :action-label="canCreateNotification ? 'Create your first rule' : undefined"
            @action="openCreate"
        />

        <!-- Card List -->
        <div
            v-else
            class="space-y-3"
        >
            <NotificationCard
                v-for="rule in notifications"
                :key="rule.id"
                :rule="rule"
                :integration-label="integrationLabel(rule.integrationId)"
                :readonly="!canManageNotification(rule.integrationId)"
                @toggle="handleToggleEnabled"
                @edit="openEdit"
                @delete="confirmDelete"
            />
        </div>

        <!-- Create/Edit Dialog -->
        <Dialog
            :open="showDialog"
            @update:open="!isSaving && (showDialog = $event)"
        >
            <template #default="{close}">
                <NotificationDetailsCard
                    :integrations="integrations.filter((i) => hasRole(i.role, 'member'))"
                    :existing-rule="editingRule"
                    :is-saving="isSaving"
                    :save-error="saveError"
                    :on-close="close"
                    :on-save="handleSave"
                />
            </template>
        </Dialog>

        <!-- Delete Confirmation Dialog -->
        <DeleteNotificationDialog
            :open="showDeleteConfirm"
            @update:open="showDeleteConfirm = $event"
            @confirm="handleDelete"
        />
    </div>
</template>
