<script setup lang="ts">
    import IntegrationDetailsCard from '@/components/IntegrationDetailsCard.vue';
    import {useAuth} from '@/composables/useAuth';
    import {useGithubApp} from '@/composables/useGithubApp';
    import {useIntegration} from '@/composables/useIntegration';
    import {Integration} from '@common/types';
    import {computed, onMounted, reactive, ref} from 'vue';
    import {useRoute, useRouter} from 'vue-router';

    const {getUserAttributes} = useAuth();
    const {getIntegrations, isLoadingIntegrations, createIntegration, updateIntegration, deleteIntegration} = useIntegration();
    const {linkInstallation, unlinkInstallation, updateWebhookEvents, isLoading: isLinkingApp} = useGithubApp();
    const route = useRoute();
    const router = useRouter();

    const githubAppSlug = import.meta.env.VITE_GITHUB_APP_SLUG;

    const integrations = reactive(new Map());
    const userId = ref<number>();
    const dialog = ref(false);
    const editingIntegration = ref<Integration | undefined>(undefined);
    const showSecret = reactive(new Map<string, boolean>());
    const confirmInput = ref('');
    const confirmAction = ref<{type: 'unlink' | 'delete'; integrationId: string; label: string; installationId?: number} | null>(null);
    const confirmDialog = ref(false);

    const openConfirmDialog = (type: 'unlink' | 'delete', integrationId: string, label: string, installationId?: number) => {
        confirmInput.value = '';
        confirmAction.value = {type, integrationId, label, installationId};
        confirmDialog.value = true;
    };

    const executeConfirmAction = async () => {
        if (!confirmAction.value || confirmInput.value !== confirmAction.value.label) return;
        if (confirmAction.value.type === 'delete') {
            await handleDeleteIntegration(confirmAction.value.integrationId);
        } else if (confirmAction.value.type === 'unlink' && confirmAction.value.installationId) {
            await handleUnlink(confirmAction.value.integrationId, confirmAction.value.installationId);
        }
        confirmDialog.value = false;
        confirmAction.value = null;
        confirmInput.value = '';
    };

    // GitHub App linking state
    const linkDialog = ref(false);
    const pendingInstallationId = ref<number | null>(null);
    const selectedIntegrationId = ref<string>('');
    const createNewForLink = ref(false);
    const newIntegrationLabel = ref('');
    const linkResult = ref<{accountLogin: string; webhookCount: number} | null>(null);
    const linkError = ref<string | null>(null);

    const handleListIntegrations = async () => {
        const response = await getIntegrations();
        response.forEach((integration: Integration) => {
            integrations.set(integration.integrationId, integration);
        });
    };

    const handlePutIntegration = async (label: string) => {
        const integration = await createIntegration(label);
        integrations.set(integration.integrationId, integration);
        return integration;
    };

    const handleUpdateIntegration = async (id: string, label: string) => {
        const integration = await updateIntegration(id, label);
        integrations.set(integration.integrationId, integration);
    };

    const handleDeleteIntegration = async (id: string) => {
        await deleteIntegration(id);
        integrations.delete(id);
    };

    const onSave = async (label: string, id?: string) => {
        if (id) {
            await handleUpdateIntegration(id, label);
        } else {
            await handlePutIntegration(label);
        }
        dialog.value = false;
        editingIntegration.value = undefined;
    };

    const onEdit = (integration: Integration) => {
        editingIntegration.value = integration;
        dialog.value = true;
    };

    const onCloseDialog = () => {
        dialog.value = false;
        editingIntegration.value = undefined;
    };

    const toggleSecret = (id: string) => {
        showSecret.set(id, !showSecret.get(id));
    };

    const getIntegrationUrl = (id: string) => {
        return `${import.meta.env.VITE_IMPORT_URL_BASE}/${id}`;
    };

    const copyToClipboard = async (text: string) => {
        await navigator.clipboard.writeText(text);
    };

    const userIsOwner = (owner: number) => {
        return owner === userId.value;
    };

    const getOwnerAnnotation = (owner: number) => {
        return userIsOwner(owner) ? 'you' : 'not you';
    };

    // GitHub App linking handlers
    const handleLinkInstallation = async () => {
        linkError.value = null;
        linkResult.value = null;

        try {
            let targetIntegrationId = selectedIntegrationId.value;

            if (createNewForLink.value) {
                if (!newIntegrationLabel.value.trim()) {
                    linkError.value = 'Please enter a label for the new integration';
                    return;
                }
                const integration = await handlePutIntegration(newIntegrationLabel.value.trim());
                targetIntegrationId = integration.integrationId;
            }

            if (!targetIntegrationId || !pendingInstallationId.value) {
                linkError.value = 'Please select an integration';
                return;
            }

            const result = await linkInstallation(targetIntegrationId, pendingInstallationId.value);
            linkResult.value = {accountLogin: result.accountLogin, webhookCount: result.webhookCount};

            // Refresh integrations to get updated status
            await handleListIntegrations();
        } catch (err: any) {
            linkError.value = err.message || 'Failed to link installation';
        }
    };

    const closeLinkDialog = () => {
        linkDialog.value = false;
        pendingInstallationId.value = null;
        selectedIntegrationId.value = '';
        createNewForLink.value = false;
        newIntegrationLabel.value = '';
        linkResult.value = null;
        linkError.value = null;

        // Clear query params
        router.replace({query: {}});
    };

    const getAppBadge = (integrationId: string) => {
        const integration = integrations.get(integrationId);
        if (!integration || integration.githubAppInstallations.length === 0) return null;
        const inst = integration.githubAppInstallations[0];
        return {
            accountLogin: inst.accountLogin,
            webhookCount: inst.webhooks.length,
            webhookEvents: inst.webhookEvents,
            installationId: inst.installationId,
        };
    };

    const handleUnlink = async (integrationId: string, installationId: number) => {
        await unlinkInstallation(integrationId, installationId);
        const integration = integrations.get(integrationId);
        if (integration) {
            integration.githubAppInstallations = [];
        }
    };

    const handleToggleEvent = async (integrationId: string, installationId: number, currentEvents: string[], event: string) => {
        const newEvents = currentEvents.includes(event) ? currentEvents.filter((e) => e !== event) : [...currentEvents, event];
        if (newEvents.length === 0) return; // Must have at least one event
        await updateWebhookEvents(integrationId, installationId, newEvents);
        await handleListIntegrations();
    };

    const headers = [
        {title: 'Label', key: 'label', sortable: true},
        {title: 'Webhook URL', key: 'webhookUrl', sortable: false},
        {title: 'Secret', key: 'secret', sortable: false},
        {title: 'GitHub App', key: 'githubApp', sortable: false},
        {title: 'Owner', key: 'ownerId', sortable: true},
        {title: 'Actions', key: 'actions', sortable: false, align: 'end' as const},
    ];

    const integrationsArray = computed(() => {
        return Array.from(integrations.values());
    });

    onMounted(async () => {
        const userAttrs = await getUserAttributes();
        userId.value = userAttrs.userId;
        await handleListIntegrations();

        // Check for GitHub App callback
        const installationId = route.query.installation_id;
        const setupAction = route.query.setup_action;

        if (installationId && setupAction === 'install') {
            pendingInstallationId.value = parseInt(installationId as string, 10);
            linkDialog.value = true;
        }
    });
</script>

<template>
    <div style="height: 100%">
        <!-- Integration edit/create dialog -->
        <v-dialog
            v-model="dialog"
            max-width="600"
        >
            <IntegrationDetailsCard
                v-if="dialog"
                :integration="editingIntegration"
                :onClose="onCloseDialog"
                :onSave="onSave"
            />
        </v-dialog>

        <!-- GitHub App link dialog (shown after app install callback) -->
        <v-dialog
            v-model="linkDialog"
            max-width="550"
            persistent
        >
            <v-card>
                <v-card-title>Link GitHub App Installation</v-card-title>
                <v-card-text v-if="linkResult">
                    <v-alert
                        type="success"
                        variant="tonal"
                        class="mb-2"
                    >
                        Successfully linked to <strong>{{ linkResult.accountLogin }}</strong> and provisioned
                        {{ linkResult.webhookCount }} webhook(s).
                    </v-alert>
                </v-card-text>
                <v-card-text v-else>
                    <p class="mb-4">Choose an integration to connect this GitHub App installation to:</p>

                    <v-alert
                        v-if="linkError"
                        type="error"
                        variant="tonal"
                        class="mb-4"
                    >
                        {{ linkError }}
                    </v-alert>

                    <v-radio-group v-model="createNewForLink">
                        <v-radio
                            :value="false"
                            label="Link to existing integration"
                        />
                        <v-radio
                            :value="true"
                            label="Create new integration"
                        />
                    </v-radio-group>

                    <v-select
                        v-if="!createNewForLink"
                        v-model="selectedIntegrationId"
                        :items="integrationsArray"
                        item-title="label"
                        item-value="integrationId"
                        label="Select integration"
                        variant="outlined"
                        density="compact"
                    />

                    <v-text-field
                        v-if="createNewForLink"
                        v-model="newIntegrationLabel"
                        label="New integration label"
                        variant="outlined"
                        density="compact"
                    />
                </v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn
                        text="Close"
                        @click="closeLinkDialog"
                    />
                    <v-btn
                        v-if="!linkResult"
                        text="Link"
                        color="primary"
                        :loading="isLinkingApp"
                        @click="handleLinkInstallation"
                    />
                </v-card-actions>
            </v-card>
        </v-dialog>

        <v-data-table-virtual
            :headers="headers"
            :items="integrationsArray"
            item-value="integrationId"
            class="elevation-1"
            hide-default-footer
            fixed-header
            :loading="isLoadingIntegrations"
            height="100%"
            :items-per-page="-1"
        >
            <template v-slot:top>
                <v-toolbar flat>
                    <v-spacer></v-spacer>
                    <v-btn
                        class="me-2"
                        prepend-icon="mdi-github"
                        rounded="lg"
                        text="Install GitHub App"
                        :href="`https://github.com/apps/${githubAppSlug}/installations/new`"
                    ></v-btn>
                    <v-btn
                        class="me-2"
                        prepend-icon="mdi-plus"
                        rounded="lg"
                        text="Add an integration"
                        @click="dialog = true"
                    ></v-btn>
                </v-toolbar>
            </template>

            <template v-slot:loading>
                <v-skeleton-loader type="table-row@5"></v-skeleton-loader>
            </template>

            <template v-slot:item.label="{item}">
                <span class="font-weight-medium">{{ item.label }}</span>
            </template>

            <template v-slot:item.webhookUrl="{item}">
                <div class="d-flex align-center">
                    <a
                        :href="getIntegrationUrl(item.integrationId)"
                        target="_blank"
                        class="text-decoration-none text-truncate"
                        style="max-width: 280px; display: inline-block"
                        :title="getIntegrationUrl(item.integrationId)"
                    >
                        {{ getIntegrationUrl(item.integrationId) }}
                    </a>
                    <v-btn
                        variant="text"
                        density="compact"
                        icon="mdi-content-copy"
                        size="small"
                        class="ml-1"
                        @click="copyToClipboard(getIntegrationUrl(item.integrationId))"
                    >
                        <v-icon size="small">mdi-content-copy</v-icon>
                        <v-tooltip
                            activator="parent"
                            location="top"
                            >Copy URL</v-tooltip
                        >
                    </v-btn>
                </div>
            </template>

            <template v-slot:item.secret="{item}">
                <div class="d-flex align-center">
                    <span class="secret-container">
                        <Transition
                            name="fade"
                            mode="out-in"
                        >
                            <span
                                v-if="showSecret.get(item.integrationId)"
                                key="visible"
                            >
                                {{ item.secret }}
                            </span>
                            <span
                                v-else
                                key="hidden"
                            >
                                ••••••••••••••••
                            </span>
                        </Transition>
                    </span>
                    <v-btn
                        variant="text"
                        density="compact"
                        @click="toggleSecret(item.integrationId)"
                        class="ml-2"
                        :color="showSecret.get(item.integrationId) ? 'warning' : undefined"
                        :icon="showSecret.get(item.integrationId) ? 'mdi-eye-off' : 'mdi-eye'"
                    ></v-btn>
                </div>
            </template>

            <template v-slot:item.githubApp="{item}">
                <template v-if="getAppBadge(item.integrationId)">
                    <v-menu location="bottom">
                        <template v-slot:activator="{props}">
                            <v-chip
                                v-bind="props"
                                color="success"
                                size="small"
                                prepend-icon="mdi-github"
                            >
                                {{ getAppBadge(item.integrationId)!.accountLogin }}
                                <v-badge
                                    :content="getAppBadge(item.integrationId)!.webhookCount"
                                    color="info"
                                    inline
                                    class="ml-1"
                                />
                            </v-chip>
                        </template>
                        <v-card min-width="280">
                            <v-card-title class="text-subtitle-1">GitHub App</v-card-title>
                            <v-card-text>
                                <div class="mb-2"><strong>Account:</strong> {{ getAppBadge(item.integrationId)!.accountLogin }}</div>
                                <div class="mb-2"><strong>Webhooks:</strong> {{ getAppBadge(item.integrationId)!.webhookCount }}</div>
                                <div class="mb-3">
                                    <strong>Events:</strong>
                                    <div class="d-flex flex-wrap ga-1 mt-1">
                                        <v-chip
                                            v-for="event in ['workflow_run', 'workflow_job', 'pull_request']"
                                            :key="event"
                                            size="x-small"
                                            :color="getAppBadge(item.integrationId)!.webhookEvents.includes(event) ? 'primary' : 'default'"
                                            :variant="getAppBadge(item.integrationId)!.webhookEvents.includes(event) ? 'flat' : 'outlined'"
                                            @click="
                                                handleToggleEvent(
                                                    item.integrationId,
                                                    getAppBadge(item.integrationId)!.installationId,
                                                    getAppBadge(item.integrationId)!.webhookEvents,
                                                    event,
                                                )
                                            "
                                        >
                                            {{ event }}
                                            <v-tooltip
                                                activator="parent"
                                                location="top"
                                                >Click to
                                                {{ getAppBadge(item.integrationId)!.webhookEvents.includes(event) ? 'disable' : 'enable' }}</v-tooltip
                                            >
                                        </v-chip>
                                    </div>
                                </div>
                            </v-card-text>
                            <v-card-actions>
                                <v-spacer></v-spacer>
                                <v-btn
                                    text="Unlink"
                                    color="error"
                                    size="small"
                                    variant="text"
                                    @click="
                                        openConfirmDialog('unlink', item.integrationId, item.label, getAppBadge(item.integrationId)!.installationId)
                                    "
                                />
                            </v-card-actions>
                        </v-card>
                    </v-menu>
                </template>
                <span
                    v-else
                    class="text-grey"
                    >—</span
                >
            </template>

            <template v-slot:item.ownerId="{item}">{{ getOwnerAnnotation(item.ownerId) }}</template>

            <template v-slot:item.actions="{item}">
                <div
                    v-if="userIsOwner(item.ownerId)"
                    class="d-flex flex-nowrap"
                >
                    <v-btn
                        color="primary"
                        variant="text"
                        icon="mdi-pencil"
                        density="compact"
                        @click="onEdit(item)"
                        class="mr-1"
                    >
                        <v-icon>mdi-pencil</v-icon>
                        <v-tooltip
                            activator="parent"
                            location="top"
                            >Edit</v-tooltip
                        >
                    </v-btn>
                    <v-btn
                        color="error"
                        variant="text"
                        icon="mdi-delete"
                        density="compact"
                        @click="openConfirmDialog('delete', item.integrationId, item.label)"
                    >
                        <v-icon>mdi-delete</v-icon>
                        <v-tooltip
                            activator="parent"
                            location="top"
                            >Delete</v-tooltip
                        >
                    </v-btn>
                </div>
            </template>
        </v-data-table-virtual>

        <!-- Confirm unlink/delete dialog -->
        <v-dialog
            v-model="confirmDialog"
            max-width="500"
            @after-leave="
                confirmInput = '';
                confirmAction = null;
            "
        >
            <v-card v-if="confirmAction">
                <v-card-title>{{ confirmAction.type === 'delete' ? 'Delete' : 'Unlink' }} Integration</v-card-title>
                <v-card-text>
                    <p class="mb-4">
                        <template v-if="confirmAction.type === 'delete'">
                            This will permanently delete the integration and break any import workflows using it. This action cannot be undone.
                        </template>
                        <template v-else>
                            This will unlink the GitHub App from this integration. Webhook events will no longer be forwarded.
                        </template>
                    </p>
                    <p class="mb-2">
                        To confirm, type <strong>{{ confirmAction.label }}</strong> below:
                    </p>
                    <v-text-field
                        v-model="confirmInput"
                        :placeholder="confirmAction.label"
                        density="compact"
                        variant="outlined"
                        hide-details
                        autofocus
                        @keyup.enter="executeConfirmAction"
                    />
                </v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn
                        text="Cancel"
                        @click="confirmDialog = false"
                    />
                    <v-btn
                        :text="confirmAction.type === 'delete' ? 'Delete' : 'Unlink'"
                        color="error"
                        variant="flat"
                        :disabled="confirmInput !== confirmAction.label"
                        @click="executeConfirmAction"
                    />
                </v-card-actions>
            </v-card>
        </v-dialog>
    </div>
</template>

<style scoped>
    .secret-container {
        min-width: 265px;
        display: inline-block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .fade-enter-active,
    .fade-leave-active {
        transition: opacity 0.3s ease;
    }

    .fade-enter-from,
    .fade-leave-to {
        opacity: 0;
    }
</style>
