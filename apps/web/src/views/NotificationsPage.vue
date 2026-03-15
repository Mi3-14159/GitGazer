<script setup lang="ts">
    import DeleteNotificationDialog from '@/components/notifications/DeleteNotificationDialog.vue';
    import NotificationCard from '@/components/notifications/NotificationCard.vue';
    import NotificationDetailsCard from '@/components/notifications/NotificationDetailsCard.vue';
    import Button from '@/components/ui/Button.vue';
    import Dialog from '@/components/ui/Dialog.vue';
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
