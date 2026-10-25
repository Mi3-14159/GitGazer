import {useGithubApp} from '@/composables/useGithubApp';
import {useIntegration} from '@/composables/useIntegration';
import {useMembers} from '@/composables/useMembers';
import type {IntegrationWithRole} from '@common/types';
import {ref} from 'vue';

export function useIntegrationCrud() {
    const {getIntegrations, isLoadingIntegrations, createIntegration, updateIntegration, deleteIntegration} = useIntegration();
    const {linkInstallation} = useGithubApp();
    const {leaveIntegration: leaveIntegrationApi} = useMembers();

    const integrations = ref<IntegrationWithRole[]>([]);

    // Create/Edit dialog
    const showDialog = ref(false);

    // Delete dialog
    const showDeleteConfirm = ref(false);
    const deletingIntegration = ref<IntegrationWithRole | null>(null);

    // GitHub App callback dialog
    const showAppLinkDialog = ref(false);
    const callbackInstallationId = ref<number | null>(null);
    const appLinkError = ref('');

    // Leave dialog
    const showLeaveConfirm = ref(false);
    const leavingIntegration = ref<IntegrationWithRole | null>(null);
    const isLeaving = ref(false);

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
        openCreate,
        handleSave,
        handleSaveLabel,
        // Delete
        showDeleteConfirm,
        deletingIntegration,
        confirmDelete,
        handleDelete,
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
        refreshIntegrations,
    };
}
