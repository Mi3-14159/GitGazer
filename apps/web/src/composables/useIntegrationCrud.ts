import { useGithubApp } from '@/composables/useGithubApp';
import { useIntegration } from '@/composables/useIntegration';
import { useMembers } from '@/composables/useMembers';
import type { IntegrationWithRole, OrgSyncDefaultRole } from '@common/types';
import { ref } from 'vue';

const IMPORT_URL_BASE = import.meta.env.VITE_IMPORT_URL_BASE;

export function useIntegrationCrud() {
    const {getIntegrations, isLoadingIntegrations, createIntegration, updateIntegration, deleteIntegration, rotateSecret, updateOrgSyncDefaultRole} =
        useIntegration();
    const {linkInstallation, unlinkInstallation, updateWebhookEvents} = useGithubApp();
    const {leaveIntegration: leaveIntegrationApi} = useMembers();

    const integrations = ref<IntegrationWithRole[]>([]);

    // Create/Edit dialog
    const showDialog = ref(false);
    const editingIntegration = ref<IntegrationWithRole | null>(null);

    // Delete dialog
    const showDeleteConfirm = ref(false);
    const deletingIntegration = ref<IntegrationWithRole | null>(null);

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

    // Leave dialog
    const showLeaveConfirm = ref(false);
    const leavingIntegration = ref<IntegrationWithRole | null>(null);
    const isLeaving = ref(false);

    function getWebhookUrl(integrationId: string): string {
        return `${IMPORT_URL_BASE}/${integrationId}`;
    }

    function getEnabledEvents(integration: IntegrationWithRole): string[] {
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
        showDialog.value = true;
    }

    async function handleSave(label: string) {
        const created = await createIntegration(label);
        integrations.value.push({...created, role: 'owner'});
        showDialog.value = false;
    }

    async function handleSaveLabel(id: string, label: string) {
        const updated = await updateIntegration(id, label);
        const idx = integrations.value.findIndex((i) => i.integrationId === updated.integrationId);
        // Preserve the local role — the update endpoint doesn't return it
        if (idx !== -1) integrations.value[idx] = {...updated, role: integrations.value[idx].role};
    }

    function confirmDelete(integration: IntegrationWithRole) {
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
            if (idx !== -1) integrations.value[idx] = {...updated, role: integrations.value[idx].role};
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

    async function handleUpdateOrgSyncRole(integrationId: string, role: OrgSyncDefaultRole) {
        try {
            await updateOrgSyncDefaultRole(integrationId, role);
        } finally {
            await refreshIntegrations();
        }
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

    function confirmLeave(integration: IntegrationWithRole) {
        leavingIntegration.value = integration;
        showLeaveConfirm.value = true;
    }

    async function handleLeave() {
        if (!leavingIntegration.value) return;
        isLeaving.value = true;
        try {
            await leaveIntegrationApi(leavingIntegration.value.integrationId);
            integrations.value = integrations.value.filter((i) => i.integrationId !== leavingIntegration.value!.integrationId);
        } finally {
            isLeaving.value = false;
            showLeaveConfirm.value = false;
            leavingIntegration.value = null;
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
        // Org sync
        handleUpdateOrgSyncRole,
        // GitHub App callback
        showAppLinkDialog,
        callbackInstallationId,
        appLinkError,
        handleLinkToExisting,
        handleCreateAndLink,
        // Leave
        showLeaveConfirm,
        leavingIntegration,
        isLeaving,
        confirmLeave,
        handleLeave,
        // Helpers
        getWebhookUrl,
        getEnabledEvents,
        refreshIntegrations,
    };
}
