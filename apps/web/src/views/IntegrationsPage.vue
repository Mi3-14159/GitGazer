<script setup lang="ts">
    import DeleteIntegrationDialog from '@/components/integrations/DeleteIntegrationDialog.vue';
    import GitHubAppLinkDialog from '@/components/integrations/GitHubAppLinkDialog.vue';
    import IntegrationCard from '@/components/integrations/IntegrationCard.vue';
    import IntegrationDetailsCard from '@/components/integrations/IntegrationDetailsCard.vue';
    import RotateSecretDialog from '@/components/integrations/RotateSecretDialog.vue';
    import UnlinkInstallationDialog from '@/components/integrations/UnlinkInstallationDialog.vue';
    import Button from '@/components/ui/Button.vue';
    import Dialog from '@/components/ui/Dialog.vue';
    import Skeleton from '@/components/ui/Skeleton.vue';
    import {useGithubApp} from '@/composables/useGithubApp';
    import {useIntegration} from '@/composables/useIntegration';
    import type {Integration} from '@common/types';
    import {ExternalLink, Github, Plug, Plus} from 'lucide-vue-next';
    import {onMounted, ref} from 'vue';
    import {useRoute, useRouter} from 'vue-router';

    const IMPORT_URL_BASE = import.meta.env.VITE_IMPORT_URL_BASE;
    const route = useRoute();
    const router = useRouter();

    const {getIntegrations, isLoadingIntegrations, createIntegration, updateIntegration, deleteIntegration, rotateSecret} = useIntegration();
    const {linkInstallation, unlinkInstallation, updateWebhookEvents} = useGithubApp();

    const integrations = ref<Integration[]>([]);

    // Create/Edit dialog
    const showDialog = ref(false);
    const editingIntegration = ref<Integration | null>(null);

    // Delete dialog
    const showDeleteConfirm = ref(false);
    const deletingIntegration = ref<Integration | null>(null);

    // Rotate secret dialog
    const showRotateConfirm = ref(false);
    const rotatingIntegrationId = ref<string | null>(null);
    const isRotating = ref(false);

    // Unlink dialog
    const showUnlinkConfirm = ref(false);
    const unlinkingIntegrationId = ref<string | null>(null);
    const unlinkingInstallationId = ref<number | null>(null);
    const isUnlinking = ref(false);

    // GitHub App callback dialog
    const showAppLinkDialog = ref(false);
    const callbackInstallationId = ref<number | null>(null);
    const appLinkError = ref('');

    function getWebhookUrl(integrationId: string): string {
        return `${IMPORT_URL_BASE}/${integrationId}`;
    }

    function getEnabledEvents(integration: Integration): string[] {
        const events = new Set<string>();
        integration.githubAppInstallations?.forEach((inst: any) => {
            inst.webhooks?.forEach((w: any) => {
                if (Array.isArray(w.events)) {
                    w.events.forEach((e: string) => events.add(e));
                } else if (w.eventName) {
                    events.add(w.eventName);
                }
            });
        });
        return Array.from(events);
    }

    async function refreshIntegrations() {
        const data = await getIntegrations();
        if (data) integrations.value = data;
    }

    onMounted(async () => {
        await refreshIntegrations();

        // Handle GitHub App installation callback
        const installationIdParam = route.query.installation_id;
        const setupAction = route.query.setup_action;
        if (installationIdParam && (setupAction === 'install' || setupAction === 'update')) {
            callbackInstallationId.value = Number(installationIdParam);
            showAppLinkDialog.value = true;
            router.replace({path: route.path, query: {}});
        }
    });

    // CRUD handlers
    function openCreate() {
        editingIntegration.value = null;
        showDialog.value = true;
    }

    async function handleSave(label: string) {
        if (editingIntegration.value) {
            const updated = await updateIntegration(editingIntegration.value.integrationId, label);
            const idx = integrations.value.findIndex((i) => i.integrationId === updated.integrationId);
            if (idx !== -1) integrations.value[idx] = updated;
        } else {
            const created = await createIntegration(label);
            integrations.value.push(created);
        }
        showDialog.value = false;
    }

    async function handleSaveLabel(id: string, label: string) {
        const updated = await updateIntegration(id, label);
        const idx = integrations.value.findIndex((i) => i.integrationId === updated.integrationId);
        if (idx !== -1) integrations.value[idx] = updated;
    }

    // Delete
    function confirmDelete(integration: Integration) {
        deletingIntegration.value = integration;
        showDeleteConfirm.value = true;
    }

    async function handleDelete() {
        if (!deletingIntegration.value) return;
        await deleteIntegration(deletingIntegration.value.integrationId);
        integrations.value = integrations.value.filter((i) => i.integrationId !== deletingIntegration.value!.integrationId);
        showDeleteConfirm.value = false;
        deletingIntegration.value = null;
    }

    // Rotate secret
    function confirmRotate(integrationId: string) {
        rotatingIntegrationId.value = integrationId;
        showRotateConfirm.value = true;
    }

    async function handleRotateSecret() {
        if (!rotatingIntegrationId.value) return;
        isRotating.value = true;
        try {
            const updated = await rotateSecret(rotatingIntegrationId.value);
            const idx = integrations.value.findIndex((i) => i.integrationId === updated.integrationId);
            if (idx !== -1) integrations.value[idx] = updated;
        } finally {
            isRotating.value = false;
            showRotateConfirm.value = false;
            rotatingIntegrationId.value = null;
        }
    }

    // Unlink
    function confirmUnlink(integrationId: string, installationId: number) {
        unlinkingIntegrationId.value = integrationId;
        unlinkingInstallationId.value = installationId;
        showUnlinkConfirm.value = true;
    }

    async function handleUnlink() {
        if (!unlinkingIntegrationId.value || !unlinkingInstallationId.value) return;
        isUnlinking.value = true;
        try {
            await unlinkInstallation(unlinkingIntegrationId.value, unlinkingInstallationId.value);
            await refreshIntegrations();
        } finally {
            isUnlinking.value = false;
            showUnlinkConfirm.value = false;
            unlinkingIntegrationId.value = null;
            unlinkingInstallationId.value = null;
        }
    }

    // Webhook events
    async function handleSaveEvents(integrationId: string, installationId: number, events: string[]) {
        await updateWebhookEvents(integrationId, installationId, events);
        await refreshIntegrations();
    }

    // GitHub App link callback
    async function handleLinkToExisting(integrationId: string, installationId: number) {
        appLinkError.value = '';
        try {
            await linkInstallation(integrationId, installationId);
            await refreshIntegrations();
            showAppLinkDialog.value = false;
            callbackInstallationId.value = null;
        } catch (e) {
            appLinkError.value = e instanceof Error ? e.message : 'Failed to link installation';
        }
    }

    async function handleCreateAndLink(label: string, installationId: number) {
        appLinkError.value = '';
        try {
            const created = await createIntegration(label);
            await linkInstallation(created.integrationId, installationId);
            await refreshIntegrations();
            showAppLinkDialog.value = false;
            callbackInstallationId.value = null;
        } catch (e) {
            appLinkError.value = e instanceof Error ? e.message : 'Failed to link installation';
        }
    }
</script>

<template>
    <div class="space-y-4">
        <!-- Header -->
        <div class="flex items-start justify-between">
            <p class="text-sm text-muted-foreground">Manage webhook endpoints, secrets, and GitHub App installations</p>
            <div class="flex items-center gap-2">
                <a
                    href="https://github.com/apps/gitgazer-integration/installations/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-xs font-medium h-8 border border-border bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                    <Github class="h-4 w-4" />
                    Install GitHub App
                    <ExternalLink class="h-3 w-3" />
                </a>
                <Button
                    size="sm"
                    @click="openCreate"
                >
                    <Plus class="h-4 w-4" />
                    New Integration
                </Button>
            </div>
        </div>

        <!-- Loading -->
        <div
            v-if="isLoadingIntegrations"
            class="space-y-3"
        >
            <Skeleton class="h-40 w-full rounded-xl" />
            <Skeleton class="h-40 w-full rounded-xl" />
        </div>

        <!-- Empty -->
        <div
            v-else-if="integrations.length === 0"
            class="rounded-xl border bg-card p-8 text-center"
        >
            <Plug class="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p class="mt-2 text-sm text-muted-foreground">No integrations configured yet.</p>
            <Button
                size="sm"
                class="mt-4"
                @click="openCreate"
                >Create your first integration</Button
            >
        </div>

        <!-- Integration cards -->
        <div
            v-else
            class="space-y-3"
        >
            <IntegrationCard
                v-for="integration in integrations"
                :key="integration.integrationId"
                :integration="integration"
                :webhook-url="getWebhookUrl(integration.integrationId)"
                @save-label="handleSaveLabel"
                @delete="confirmDelete"
                @rotate="confirmRotate"
                @unlink="confirmUnlink"
                @save-events="handleSaveEvents"
            />
        </div>

        <!-- Create/Edit Dialog -->
        <Dialog
            :open="showDialog"
            @update:open="showDialog = $event"
        >
            <template #default="{close}">
                <IntegrationDetailsCard
                    :integration="editingIntegration"
                    :webhook-url="editingIntegration ? getWebhookUrl(editingIntegration.integrationId) : undefined"
                    :enabled-events="editingIntegration ? getEnabledEvents(editingIntegration) : []"
                    :on-close="close"
                    :on-save="handleSave"
                />
            </template>
        </Dialog>

        <!-- Delete Confirmation -->
        <DeleteIntegrationDialog
            :open="showDeleteConfirm"
            :integration="deletingIntegration"
            @update:open="showDeleteConfirm = $event"
            @confirm="handleDelete"
        />

        <!-- Rotate Secret Confirmation -->
        <RotateSecretDialog
            :open="showRotateConfirm"
            :is-rotating="isRotating"
            @update:open="showRotateConfirm = $event"
            @confirm="handleRotateSecret"
        />

        <!-- Unlink Confirmation -->
        <UnlinkInstallationDialog
            :open="showUnlinkConfirm"
            :is-unlinking="isUnlinking"
            @update:open="showUnlinkConfirm = $event"
            @confirm="handleUnlink"
        />

        <!-- GitHub App Link Dialog (callback flow) -->
        <GitHubAppLinkDialog
            :open="showAppLinkDialog"
            :installation-id="callbackInstallationId"
            :integrations="integrations"
            :error="appLinkError"
            @update:open="showAppLinkDialog = $event"
            @link-to-existing="handleLinkToExisting"
            @create-and-link="handleCreateAndLink"
        />
    </div>
</template>
