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
    import type {Integration, NotificationRule} from '@common/types';
    import {Bell, Plus} from 'lucide-vue-next';
    import {onMounted, ref} from 'vue';

    const {getNotifications, isLoadingNotifications, upsertNotification, deleteNotification} = useNotification();
    const {getIntegrations} = useIntegration();

    const notifications = ref<NotificationRule[]>([]);
    const integrations = ref<Integration[]>([]);
    const showDialog = ref(false);
    const editingRule = ref<NotificationRule | null>(null);
    const showDeleteConfirm = ref(false);
    const deletingRule = ref<NotificationRule | null>(null);

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
</script>

<template>
    <div
        data-tour="notifications-content"
        class="space-y-4 p-4"
    >
        <!-- Header -->
        <PageHeader description="Configure Slack webhooks to receive alerts about workflow status changes">
            <Button
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
            message="No notification rules configured."
            action-label="Create your first rule"
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
                @toggle="handleToggleEnabled"
                @edit="openEdit"
                @delete="confirmDelete"
            />
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
        <DeleteNotificationDialog
            :open="showDeleteConfirm"
            @update:open="showDeleteConfirm = $event"
            @confirm="handleDelete"
        />
    </div>
</template>
