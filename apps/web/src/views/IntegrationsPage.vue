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
    import {useIntegrationCrud} from '@/composables/useIntegrationCrud';
    import {ExternalLink, Github, Plug, Plus} from 'lucide-vue-next';
    import {onMounted} from 'vue';
    import {useRoute, useRouter} from 'vue-router';

    const route = useRoute();
    const router = useRouter();

    const {
        integrations,
        isLoadingIntegrations,
        showDialog,
        editingIntegration,
        openCreate,
        handleSave,
        handleSaveLabel,
        showDeleteConfirm,
        deletingIntegration,
        confirmDelete,
        handleDelete,
        showRotateConfirm,
        isRotating,
        confirmRotate,
        handleRotateSecret,
        showUnlinkConfirm,
        isUnlinking,
        confirmUnlink,
        handleUnlink,
        handleSaveEvents,
        showAppLinkDialog,
        callbackInstallationId,
        appLinkError,
        handleLinkToExisting,
        handleCreateAndLink,
        getWebhookUrl,
        getEnabledEvents,
        refreshIntegrations,
    } = useIntegrationCrud();

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
