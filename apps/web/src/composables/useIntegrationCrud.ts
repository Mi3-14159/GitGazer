import {useGithubApp} from '@/composables/useGithubApp';
import {useIntegration} from '@/composables/useIntegration';
import type {Integration} from '@common/types';
import {ref} from 'vue';

const IMPORT_URL_BASE = import.meta.env.VITE_IMPORT_URL_BASE;

export function useIntegrationCrud() {
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

    async function handleSaveEvents(integrationId: string, installationId: number, events: string[]) {
        await updateWebhookEvents(integrationId, installationId, events);
        await refreshIntegrations();
    }

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

    return {
        integrations,
        isLoadingIntegrations,
        // Create/Edit
        showDialog,
        editingIntegration,
        openCreate,
        handleSave,
        handleSaveLabel,
        // Delete
        showDeleteConfirm,
        deletingIntegration,
        confirmDelete,
        handleDelete,
        // Rotate
        showRotateConfirm,
        isRotating,
        confirmRotate,
        handleRotateSecret,
        // Unlink
        showUnlinkConfirm,
        isUnlinking,
        confirmUnlink,
        handleUnlink,
        // Events
        handleSaveEvents,
        // GitHub App callback
        showAppLinkDialog,
        callbackInstallationId,
        appLinkError,
        handleLinkToExisting,
        handleCreateAndLink,
        // Helpers
        getWebhookUrl,
        getEnabledEvents,
        refreshIntegrations,
    };
}
