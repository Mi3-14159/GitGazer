<script setup lang="ts">
    import AppIcon from '@/components/apps/AppIcon.vue';
    import {APP_INFO, GITHUB_APP_INSTALL_URL} from '@/components/apps/appCatalog';
    import GitHubInstallation from '@/components/integrations/GitHubInstallation.vue';
    import OrgSyncSettings from '@/components/integrations/OrgSyncSettings.vue';
    import RotateSecretDialog from '@/components/integrations/RotateSecretDialog.vue';
    import UnlinkInstallationDialog from '@/components/integrations/UnlinkInstallationDialog.vue';
    import WebhookCredentials from '@/components/integrations/WebhookCredentials.vue';
    import WebhookEventEditor from '@/components/integrations/WebhookEventEditor.vue';
    import Button from '@/components/ui/Button.vue';
    import {useGithubApp} from '@/composables/useGithubApp';
    import {useIntegration} from '@/composables/useIntegration';
    import type {IntegrationApp, IntegrationWithRole, OrgSyncDefaultRole} from '@common/types';
    import {ExternalLink} from '@lucide/vue';
    import {computed, shallowRef, useTemplateRef} from 'vue';

    const IMPORT_URL_BASE = import.meta.env.VITE_IMPORT_URL_BASE;

    const props = defineProps<{
        integration: IntegrationWithRole;
        app: Extract<IntegrationApp, {type: 'github'}>;
        canManage: boolean;
    }>();

    const emit = defineEmits<{
        /** The app's settings (secret, org sync role) changed. */
        changed: [];
        /** The integration's GitHub App installations changed. */
        'integration-changed': [];
        remove: [];
    }>();

    const {rotateSecret, updateOrgSyncDefaultRole} = useIntegration();
    const {unlinkInstallation, updateWebhookEvents} = useGithubApp();

    const webhookUrl = computed(() => `${IMPORT_URL_BASE}/${props.integration.integrationId}`);
    const installations = computed(() => props.integration.githubAppInstallations ?? []);
    const eventEditor = useTemplateRef<InstanceType<typeof WebhookEventEditor>>('eventEditor');

    const actionError = shallowRef<string | null>(null);

    const showRotate = shallowRef(false);
    const isRotating = shallowRef(false);

    const showUnlink = shallowRef(false);
    const unlinkingInstallationId = shallowRef<number | null>(null);
    const isUnlinking = shallowRef(false);

    function errorMessage(e: unknown, fallback: string): string {
        return e instanceof Error ? e.message : fallback;
    }

    async function onRotate() {
        isRotating.value = true;
        actionError.value = null;
        try {
            await rotateSecret(props.integration.integrationId);
            emit('changed');
        } catch (e) {
            actionError.value = errorMessage(e, 'Failed to rotate the secret');
        } finally {
            isRotating.value = false;
            showRotate.value = false;
        }
    }

    function confirmUnlink(installationId: number) {
        unlinkingInstallationId.value = installationId;
        showUnlink.value = true;
    }

    async function onUnlink() {
        if (unlinkingInstallationId.value === null) return;
        isUnlinking.value = true;
        actionError.value = null;
        try {
            await unlinkInstallation(props.integration.integrationId, unlinkingInstallationId.value);
            emit('integration-changed');
        } catch (e) {
            actionError.value = errorMessage(e, 'Failed to unlink the installation');
        } finally {
            isUnlinking.value = false;
            showUnlink.value = false;
            unlinkingInstallationId.value = null;
        }
    }

    async function onSaveEvents(integrationId: string, installationId: number, events: string[]) {
        actionError.value = null;
        try {
            await updateWebhookEvents(integrationId, installationId, events);
            emit('integration-changed');
        } catch (e) {
            actionError.value = errorMessage(e, 'Failed to update webhook events');
        } finally {
            eventEditor.value?.onSaved(installationId);
        }
    }

    async function onUpdateOrgSyncRole(integrationId: string, role: OrgSyncDefaultRole) {
        actionError.value = null;
        try {
            await updateOrgSyncDefaultRole(integrationId, role);
        } catch (e) {
            actionError.value = errorMessage(e, 'Failed to update the org sync role');
        } finally {
            emit('changed');
        }
    }
</script>

<template>
    <section
        class="rounded-xl border bg-card p-4 text-card-foreground shadow-sm"
        aria-labelledby="github-app-heading"
    >
        <div class="flex items-center gap-3">
            <AppIcon
                :icon="APP_INFO.github.icon"
                :tone="APP_INFO.github.tone.chip"
            />
            <div class="min-w-0">
                <h2
                    id="github-app-heading"
                    class="font-semibold"
                >
                    GitHub
                </h2>
                <p class="text-sm text-muted-foreground">
                    Receives runs, jobs and pull requests from GitHub App installations or a repository webhook.
                </p>
            </div>
        </div>

        <p
            v-if="actionError"
            role="alert"
            class="mt-4 text-sm text-destructive"
        >
            {{ actionError }}
        </p>

        <div class="mt-4 space-y-3">
            <WebhookCredentials
                :integration-id="integration.integrationId"
                :webhook-url="webhookUrl"
                :secret="app.settings.secret"
                :can-rotate="canManage"
                @rotate="showRotate = true"
            />

            <template v-if="installations.length > 0">
                <WebhookEventEditor
                    ref="eventEditor"
                    :installations="installations"
                    :readonly="!canManage"
                    @save-events="onSaveEvents"
                />

                <OrgSyncSettings
                    :integration-id="integration.integrationId"
                    :current-role="app.settings.orgSyncDefaultRole"
                    :readonly="!canManage"
                    @update-role="onUpdateOrgSyncRole"
                />

                <div class="space-y-4 border-t pt-2">
                    <GitHubInstallation
                        v-for="inst in installations"
                        :key="inst.installationId"
                        :installation="inst"
                        :integration-id="integration.integrationId"
                        :can-unlink="canManage"
                        @unlink="(_, installationId) => confirmUnlink(installationId)"
                    />
                </div>
            </template>
            <div
                v-else
                class="flex flex-col gap-3 border-t pt-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
            >
                <p>No GitHub App installation is linked yet.</p>
                <a
                    v-if="canManage"
                    :href="GITHUB_APP_INSTALL_URL"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    Install the GitHub App
                    <ExternalLink
                        class="size-3"
                        aria-hidden="true"
                    />
                    <span class="sr-only">(opens in a new tab)</span>
                </a>
            </div>
        </div>

        <div
            v-if="canManage"
            class="mt-4 flex justify-end border-t pt-4"
        >
            <Button
                variant="outline"
                size="sm"
                class="w-full text-destructive hover:text-destructive sm:w-auto"
                @click="emit('remove')"
            >
                Remove GitHub app
            </Button>
        </div>

        <RotateSecretDialog
            :open="showRotate"
            :is-rotating="isRotating"
            @update:open="showRotate = $event"
            @confirm="onRotate"
        />
        <UnlinkInstallationDialog
            :open="showUnlink"
            :is-unlinking="isUnlinking"
            @update:open="showUnlink = $event"
            @confirm="onUnlink"
        />
    </section>
</template>
