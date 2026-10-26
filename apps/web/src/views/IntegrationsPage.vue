<script setup lang="ts">
    import GitHubAppLinkDialog from '@/components/integrations/GitHubAppLinkDialog.vue';
    import IntegrationDetailsCard from '@/components/integrations/IntegrationDetailsCard.vue';
    import PageHeader from '@/components/PageHeader.vue';
    import Button from '@/components/ui/Button.vue';
    import Dialog from '@/components/ui/Dialog.vue';
    import EmptyState from '@/components/ui/EmptyState.vue';
    import Skeleton from '@/components/ui/Skeleton.vue';
    import {useIntegrationCrud} from '@/composables/useIntegrationCrud';
    import {formatDate, formatTimeSince} from '@/utils/formatDate';
    import {hasRole, type IntegrationWithRole} from '@common/types';
    import {ChevronRight, Plug, Plus} from '@lucide/vue';
    import {onMounted} from 'vue';
    import {RouterLink, useRoute, useRouter} from 'vue-router';

    const route = useRoute();
    const router = useRouter();

    const {
        integrations,
        isLoadingIntegrations,
        showDialog,
        openCreate,
        handleSave,
        showAppLinkDialog,
        callbackInstallationId,
        appLinkError,
        handleLinkToExisting,
        handleCreateAndLink,
        refreshIntegrations,
    } = useIntegrationCrud();

    const ROLE_LABELS = {owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Viewer'} as const;

    function summary(integration: IntegrationWithRole): string {
        const installations = integration.githubAppInstallations ?? [];
        const parts = [
            ROLE_LABELS[integration.role],
            `${installations.length} GitHub App ${installations.length === 1 ? 'installation' : 'installations'}`,
            `Created ${formatDate(integration.createdAt)}`,
        ];
        const lastUpdate = installations.reduce<Date | null>((latest, inst) => {
            const updated = new Date(inst.updatedAt);
            return !latest || updated > latest ? updated : latest;
        }, null);
        const activity = lastUpdate ? formatTimeSince(lastUpdate) : null;
        if (activity) parts.push(`Updated ${activity}`);
        return parts.join(' · ');
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
</script>

<template>
    <div
        data-tour="integrations-content"
        class="space-y-4 p-4"
    >
        <PageHeader description="Open an integration to manage its apps, members and settings">
            <Button
                size="sm"
                @click="openCreate"
            >
                <Plus class="h-4 w-4" />
                New Integration
            </Button>
        </PageHeader>

        <div
            v-if="isLoadingIntegrations"
            class="space-y-3"
            aria-busy="true"
        >
            <Skeleton class="h-16 w-full rounded-xl" />
            <Skeleton class="h-16 w-full rounded-xl" />
        </div>

        <EmptyState
            v-else-if="integrations.length === 0"
            :icon="Plug"
            message="No integrations configured yet."
            action-label="Create your first integration"
            @action="openCreate"
        />

        <ul
            v-else
            class="divide-y overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm"
        >
            <li
                v-for="integration in integrations"
                :key="integration.integrationId"
            >
                <RouterLink
                    :to="{name: 'integration', params: {integrationId: integration.integrationId, tab: 'apps'}}"
                    class="flex items-center gap-3 p-4 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                    <div class="min-w-0 flex-1">
                        <p class="break-words font-semibold">{{ integration.label }}</p>
                        <p class="text-sm text-muted-foreground">{{ summary(integration) }}</p>
                    </div>
                    <ChevronRight
                        class="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                    />
                </RouterLink>
            </li>
        </ul>

        <Dialog
            :open="showDialog"
            @update:open="showDialog = $event"
        >
            <template #default="{close}">
                <IntegrationDetailsCard
                    :on-close="close"
                    :on-save="handleSave"
                />
            </template>
        </Dialog>

        <!-- GitHub App Link Dialog (callback flow) -->
        <GitHubAppLinkDialog
            :open="showAppLinkDialog"
            :installation-id="callbackInstallationId"
            :integrations="integrations.filter((i) => hasRole(i.role, 'admin'))"
            :error="appLinkError"
            @update:open="showAppLinkDialog = $event"
            @link-to-existing="handleLinkToExisting"
            @create-and-link="handleCreateAndLink"
        />
    </div>
</template>
