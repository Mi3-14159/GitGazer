<script setup lang="ts">
    import IntegrationDetailsCard from '@/components/IntegrationDetailsCard.vue';
    import Badge from '@/components/ui/Badge.vue';
    import Button from '@/components/ui/Button.vue';
    import Card from '@/components/ui/Card.vue';
    import CardContent from '@/components/ui/CardContent.vue';
    import Dialog from '@/components/ui/Dialog.vue';
    import Input from '@/components/ui/Input.vue';
    import Skeleton from '@/components/ui/Skeleton.vue';
    import {useGithubApp, type LinkInstallationResponse} from '@/composables/useGithubApp';
    import {useIntegration} from '@/composables/useIntegration';
    import type {Integration} from '@common/types';
    import {
        Activity,
        Calendar,
        Check,
        CheckCircle2,
        Copy,
        ExternalLink,
        Eye,
        EyeOff,
        Github,
        Key,
        Plug,
        Plus,
        RefreshCw,
        Trash2,
        Unlink,
        Webhook,
        XCircle,
        Zap,
    } from 'lucide-vue-next';
    import {nextTick, onMounted, reactive, ref} from 'vue';

    const IMPORT_URL_BASE = import.meta.env.VITE_IMPORT_URL_BASE;

    const {getIntegrations, isLoadingIntegrations, createIntegration, updateIntegration, deleteIntegration, rotateSecret} = useIntegration();
    const {linkInstallation, updateWebhookEvents} = useGithubApp();

    function getWebhookUrl(integrationId: string): string {
        return `${IMPORT_URL_BASE}/${integrationId}`;
    }

    const integrations = ref<Integration[]>([]);
    const showDialog = ref(false);
    const editingIntegration = ref<Integration | null>(null);
    const showDeleteConfirm = ref(false);
    const deletingIntegration = ref<Integration | null>(null);

    // GitHub App linking
    const showLinkDialog = ref(false);
    const linkingIntegration = ref<Integration | null>(null);
    const installationIdInput = ref('');
    const linkResult = ref<LinkInstallationResponse | null>(null);
    const linkError = ref('');

    // Secret visibility
    const visibleSecrets = ref<Set<string>>(new Set());

    // Inline label editing
    const editingLabels = reactive<Record<string, string>>({});
    const labelInputRefs = ref<Record<string, HTMLInputElement | null>>({});

    // Rotate secret confirmation
    const showRotateConfirm = ref(false);
    const rotatingIntegrationId = ref<string | null>(null);

    // Delete type-to-confirm
    const deleteConfirmText = ref('');

    // Webhook event editing
    const SUPPORTED_EVENTS = ['workflow_run', 'workflow_job', 'pull_request'] as const;
    const editingEvents = reactive<Record<string, Set<string>>>({});
    const savingEvents = reactive<Record<string, boolean>>({});

    function startEditingLabel(id: string, currentLabel: string) {
        editingLabels[id] = currentLabel;
        nextTick(() => {
            labelInputRefs.value[id]?.focus();
        });
    }

    function cancelEditingLabel(id: string) {
        delete editingLabels[id];
    }

    async function saveLabel(id: string) {
        const newLabel = editingLabels[id];
        if (!newLabel?.trim()) return cancelEditingLabel(id);
        const updated = await updateIntegration(id, newLabel);
        const idx = integrations.value.findIndex((i) => i.integrationId === updated.integrationId);
        if (idx !== -1) integrations.value[idx] = updated;
        delete editingLabels[id];
    }

    onMounted(async () => {
        const data = await getIntegrations();
        if (data) integrations.value = data;
    });

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

    function formatDate(dateStr: string | Date) {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return 'today';
        if (diffDays === 1) return 'yesterday';
        if (diffDays < 30) return `${diffDays} days ago`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
        return `${Math.floor(diffDays / 365)} years ago`;
    }

    function openCreate() {
        editingIntegration.value = null;
        showDialog.value = true;
    }

    function confirmDelete(i: Integration) {
        deletingIntegration.value = i;
        deleteConfirmText.value = '';
        showDeleteConfirm.value = true;
    }

    function confirmRotateSecret(integrationId: string) {
        rotatingIntegrationId.value = integrationId;
        showRotateConfirm.value = true;
    }

    const isRotating = ref(false);

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

    async function handleDelete() {
        if (!deletingIntegration.value) return;
        await deleteIntegration(deletingIntegration.value.integrationId);
        integrations.value = integrations.value.filter((i) => i.integrationId !== deletingIntegration.value!.integrationId);
        showDeleteConfirm.value = false;
        deletingIntegration.value = null;
    }

    async function handleLink() {
        if (!linkingIntegration.value || !installationIdInput.value) return;
        linkError.value = '';
        try {
            linkResult.value = await linkInstallation(linkingIntegration.value.integrationId, Number(installationIdInput.value));
            const data = await getIntegrations();
            if (data) integrations.value = data;
        } catch (e) {
            linkError.value = e instanceof Error ? e.message : 'Failed to link installation';
        }
    }

    function toggleSecretVisibility(id: string) {
        if (visibleSecrets.value.has(id)) {
            visibleSecrets.value.delete(id);
        } else {
            visibleSecrets.value.add(id);
        }
    }

    function copyToClipboard(text: string) {
        navigator.clipboard.writeText(text);
    }

    function formatEventName(event: string): string {
        return event
            .split('_')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    function formatTimeSince(dateStr: string | Date | undefined): string | null {
        if (!dateStr) return null;
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHours = Math.floor(diffMin / 60);
        if (diffHours < 24) return `about ${diffHours}h ago`;
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 30) return `${diffDays}d ago`;
        return formatDate(dateStr);
    }

    function getLastActivity(integration: Integration): string | null {
        const installations = integration.githubAppInstallations;
        if (!installations || installations.length === 0) return null;
        let latest: Date | null = null;
        for (const inst of installations) {
            const d = new Date(inst.updatedAt);
            if (!latest || d > latest) latest = d;
        }
        return latest ? formatTimeSince(latest) : null;
    }

    function getInstallationEvents(inst: any): string[] {
        const events = new Set<string>();
        inst.webhooks?.forEach((w: any) => {
            if (Array.isArray(w.events)) {
                w.events.forEach((e: string) => events.add(e));
            }
        });
        return Array.from(events);
    }

    function startEditingEvents(instId: number, currentEvents: string[]) {
        editingEvents[instId] = new Set(currentEvents);
    }

    function cancelEditingEvents(instId: number) {
        delete editingEvents[instId];
    }

    function toggleEvent(instId: number, event: string) {
        const set = editingEvents[instId];
        if (!set) return;
        if (set.has(event)) {
            set.delete(event);
        } else {
            set.add(event);
        }
        // Force reactivity by reassigning
        editingEvents[instId] = new Set(set);
    }

    async function saveEvents(integrationId: string, instId: number) {
        const events = editingEvents[instId];
        if (!events) return;
        savingEvents[instId] = true;
        try {
            await updateWebhookEvents(integrationId, instId, Array.from(events));
            const data = await getIntegrations();
            if (data) integrations.value = data;
            delete editingEvents[instId];
        } finally {
            savingEvents[instId] = false;
        }
    }

    function getRepoNames(inst: any): string[] {
        const repos = new Set<string>();
        inst.webhooks?.forEach((w: any) => {
            if (w.targetName) repos.add(w.targetName);
        });
        return Array.from(repos);
    }

    function getPermissionCount(inst: any): number {
        const events = new Set<string>();
        inst.webhooks?.forEach((w: any) => {
            if (Array.isArray(w.events)) {
                w.events.forEach((e: string) => events.add(e));
            }
        });
        return events.size;
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
            <Card
                v-for="integration in integrations"
                :key="integration.integrationId"
            >
                <CardContent class="p-4">
                    <div class="space-y-3">
                        <!-- Header Row -->
                        <div class="flex items-center justify-between gap-2">
                            <div class="flex items-center gap-2 flex-wrap flex-1">
                                <!-- Inline label editing -->
                                <template v-if="editingLabels[integration.integrationId] !== undefined">
                                    <div class="flex items-center gap-1">
                                        <Input
                                            :ref="
                                                (el: any) => {
                                                    if (el?.$el) labelInputRefs[integration.integrationId] = el.$el;
                                                }
                                            "
                                            :model-value="editingLabels[integration.integrationId]"
                                            class="!h-7 text-sm max-w-xs"
                                            @update:model-value="(v: string) => (editingLabels[integration.integrationId] = v)"
                                            @keydown.enter="saveLabel(integration.integrationId)"
                                            @keydown.escape="cancelEditingLabel(integration.integrationId)"
                                        />
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            class="h-7 px-2"
                                            @click="saveLabel(integration.integrationId)"
                                        >
                                            Save
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            class="h-7 px-2"
                                            @click="cancelEditingLabel(integration.integrationId)"
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                </template>
                                <template v-else>
                                    <h3
                                        class="font-semibold text-base cursor-pointer hover:text-primary transition-colors"
                                        @click="startEditingLabel(integration.integrationId, integration.label)"
                                    >
                                        {{ integration.label }}
                                    </h3>
                                </template>
                                <span
                                    v-if="getEnabledEvents(integration).length > 0"
                                    class="text-xs text-muted-foreground"
                                >
                                    {{ getEnabledEvents(integration).length }} events
                                </span>
                                <span
                                    v-if="getLastActivity(integration)"
                                    class="text-xs text-muted-foreground flex items-center gap-1"
                                >
                                    <Activity class="h-3 w-3" />
                                    {{ getLastActivity(integration) }}
                                </span>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                class="h-8 w-8 p-0 text-destructive hover:text-destructive shrink-0"
                                @click="confirmDelete(integration)"
                            >
                                <Trash2 class="h-3.5 w-3.5" />
                            </Button>
                        </div>

                        <!-- Webhook URL & Secret Grid -->
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            <!-- Webhook URL -->
                            <div class="space-y-1">
                                <div class="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                                    <Webhook class="h-3 w-3" />
                                    Webhook URL
                                </div>
                                <div class="flex items-center gap-1">
                                    <Input
                                        :model-value="getWebhookUrl(integration.integrationId)"
                                        type="text"
                                        readonly
                                        class="font-mono text-xs !h-8 !px-2"
                                    />
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        class="h-8 w-8 p-0 shrink-0"
                                        @click="copyToClipboard(getWebhookUrl(integration.integrationId))"
                                    >
                                        <Copy class="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>

                            <!-- Secret -->
                            <div class="space-y-1">
                                <div class="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                                    <Key class="h-3 w-3" />
                                    Webhook Secret
                                </div>
                                <div class="flex items-center gap-1">
                                    <Input
                                        :model-value="(integration as any).secret ?? ''"
                                        :type="visibleSecrets.has(integration.integrationId + '-secret') ? 'text' : 'password'"
                                        readonly
                                        class="font-mono text-xs !h-8 !px-2"
                                    />
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        class="h-8 w-8 p-0 shrink-0"
                                        @click="toggleSecretVisibility(integration.integrationId + '-secret')"
                                    >
                                        <EyeOff
                                            v-if="visibleSecrets.has(integration.integrationId + '-secret')"
                                            class="h-3 w-3"
                                        />
                                        <Eye
                                            v-else
                                            class="h-3 w-3"
                                        />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        class="h-8 w-8 p-0 shrink-0"
                                        @click="copyToClipboard((integration as any).secret ?? '')"
                                    >
                                        <Copy class="h-3 w-3" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        class="h-8 px-2 shrink-0"
                                        title="Rotate Secret"
                                        @click="confirmRotateSecret(integration.integrationId)"
                                    >
                                        <RefreshCw class="h-3 w-3 mr-1" />
                                        <span class="text-xs">Rotate</span>
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <!-- Enabled Webhook Events -->
                        <div
                            v-if="
                                getEnabledEvents(integration).length > 0 ||
                                (integration.githubAppInstallations && integration.githubAppInstallations.length > 0)
                            "
                            class="border-t pt-2"
                        >
                            <div class="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-2">
                                <Zap class="h-3 w-3" />
                                Webhook Events
                            </div>
                            <div class="flex flex-wrap gap-1.5">
                                <template
                                    v-for="inst in integration.githubAppInstallations"
                                    :key="inst.installationId"
                                >
                                    <!-- Editing mode -->
                                    <template v-if="editingEvents[inst.installationId]">
                                        <button
                                            v-for="event in SUPPORTED_EVENTS"
                                            :key="event"
                                            class="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors cursor-pointer"
                                            :class="
                                                editingEvents[inst.installationId]?.has(event)
                                                    ? 'bg-primary/10 border-primary text-primary'
                                                    : 'bg-muted/50 border-border text-muted-foreground hover:border-primary/50'
                                            "
                                            @click="toggleEvent(inst.installationId, event)"
                                        >
                                            <CheckCircle2
                                                v-if="editingEvents[inst.installationId]?.has(event)"
                                                class="h-3 w-3"
                                            />
                                            <XCircle
                                                v-else
                                                class="h-3 w-3"
                                            />
                                            {{ formatEventName(event) }}
                                        </button>
                                        <div class="flex items-center gap-1 ml-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                class="h-6 px-2 text-xs"
                                                :disabled="savingEvents[inst.installationId]"
                                                @click="saveEvents(integration.integrationId, inst.installationId)"
                                            >
                                                {{ savingEvents[inst.installationId] ? 'Saving…' : 'Save' }}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                class="h-6 px-2 text-xs"
                                                :disabled="savingEvents[inst.installationId]"
                                                @click="cancelEditingEvents(inst.installationId)"
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    </template>
                                    <!-- Read-only mode -->
                                    <template v-else>
                                        <Badge
                                            v-for="event in getInstallationEvents(inst)"
                                            :key="event"
                                            variant="secondary"
                                            class="text-xs h-5 px-1.5 cursor-pointer hover:bg-accent transition-colors"
                                            @click="startEditingEvents(inst.installationId, getInstallationEvents(inst))"
                                        >
                                            {{ formatEventName(event) }}
                                        </Badge>
                                        <Badge
                                            v-if="getInstallationEvents(inst).length === 0"
                                            variant="outline"
                                            class="text-xs h-5 px-1.5 cursor-pointer hover:bg-accent transition-colors text-muted-foreground"
                                            @click="startEditingEvents(inst.installationId, [])"
                                        >
                                            No events — click to configure
                                        </Badge>
                                        <button
                                            v-if="getInstallationEvents(inst).length > 0"
                                            class="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
                                            @click="startEditingEvents(inst.installationId, getInstallationEvents(inst))"
                                        >
                                            Edit
                                        </button>
                                    </template>
                                </template>
                            </div>
                        </div>

                        <!-- GitHub App Installations -->
                        <div
                            v-if="integration.githubAppInstallations && integration.githubAppInstallations.length > 0"
                            class="border-t pt-2"
                        >
                            <div
                                v-for="inst in integration.githubAppInstallations"
                                :key="inst.installationId"
                                class="space-y-2"
                            >
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                        <Github class="h-3 w-3" />
                                        GitHub App: {{ inst.accountLogin }}
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        class="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                    >
                                        <Unlink class="h-3 w-3 mr-1" />
                                        Unlink
                                    </Button>
                                </div>
                                <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs mb-2">
                                    <div>
                                        <div class="text-muted-foreground">App ID</div>
                                        <div class="font-mono">{{ inst.accountId }}</div>
                                    </div>
                                    <div>
                                        <div class="text-muted-foreground">Installation</div>
                                        <div class="font-mono">inst-{{ inst.installationId }}</div>
                                    </div>
                                    <div>
                                        <div class="text-muted-foreground">Repositories</div>
                                        <div>{{ getRepoNames(inst).length }}</div>
                                    </div>
                                    <div>
                                        <div class="text-muted-foreground">Permissions</div>
                                        <div>{{ getPermissionCount(inst) }}</div>
                                    </div>
                                </div>
                                <div
                                    v-if="getRepoNames(inst).length > 0"
                                    class="flex flex-wrap gap-1"
                                >
                                    <Badge
                                        v-for="repo in getRepoNames(inst).slice(0, 3)"
                                        :key="repo"
                                        variant="outline"
                                        class="font-mono text-xs h-5 px-1.5"
                                    >
                                        {{ repo }}
                                    </Badge>
                                    <Badge
                                        v-if="getRepoNames(inst).length > 3"
                                        variant="outline"
                                        class="text-xs h-5 px-1.5"
                                    >
                                        +{{ getRepoNames(inst).length - 3 }} more
                                    </Badge>
                                </div>
                            </div>
                        </div>

                        <!-- Created timestamp -->
                        <div class="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar class="h-3 w-3" />
                            Created {{ formatDate(integration.createdAt) }}
                        </div>
                    </div>
                </CardContent>
            </Card>
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

        <!-- Link GitHub App Dialog -->
        <Dialog
            :open="showLinkDialog"
            @update:open="showLinkDialog = $event"
        >
            <template #default="{close}">
                <h3 class="text-lg font-semibold mb-4">Link GitHub App Installation</h3>
                <div
                    v-if="!linkResult"
                    class="space-y-4"
                >
                    <p class="text-sm text-muted-foreground">
                        Enter the GitHub App installation ID to link to
                        <strong>{{ linkingIntegration?.label }}</strong
                        >.
                    </p>
                    <p class="text-xs text-muted-foreground">
                        Find your installation ID on
                        <a
                            href="https://github.com/settings/installations"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                            GitHub Settings <ExternalLink class="h-3 w-3" />
                        </a>
                    </p>
                    <Input
                        v-model="installationIdInput"
                        placeholder="Installation ID (e.g., 12345678)"
                        @keydown.enter="handleLink"
                    />
                    <p
                        v-if="linkError"
                        class="text-xs text-destructive"
                    >
                        {{ linkError }}
                    </p>
                    <div class="flex justify-end gap-2">
                        <Button
                            variant="outline"
                            @click="close"
                            >Cancel</Button
                        >
                        <Button
                            @click="handleLink"
                            :disabled="!installationIdInput"
                            >Link</Button
                        >
                    </div>
                </div>
                <div
                    v-else
                    class="space-y-4"
                >
                    <div class="flex items-center gap-2 text-green-600">
                        <Check class="h-5 w-5" />
                        <span class="text-sm font-medium">Installation linked successfully</span>
                    </div>
                    <div class="text-sm text-muted-foreground space-y-1">
                        <p><strong>Account:</strong> {{ linkResult.accountLogin }} ({{ linkResult.accountType }})</p>
                        <p><strong>Webhooks:</strong> {{ linkResult.webhookCount }} events registered</p>
                    </div>
                    <div class="flex justify-end">
                        <Button @click="close">Done</Button>
                    </div>
                </div>
            </template>
        </Dialog>

        <!-- Delete Confirmation Dialog -->
        <Dialog
            :open="showDeleteConfirm"
            @update:open="
                (v: boolean) => {
                    showDeleteConfirm = v;
                    if (!v) {
                        deleteConfirmText = '';
                    }
                }
            "
        >
            <template #default="{close}">
                <h3 class="text-lg font-semibold">Delete Integration</h3>
                <p class="mt-2 text-sm text-muted-foreground">
                    This action cannot be undone. This will permanently delete the integration and all associated data.
                </p>
                <div
                    v-if="deletingIntegration"
                    class="space-y-4 py-4"
                >
                    <p class="text-sm">
                        Please type <span class="font-semibold">{{ deletingIntegration.label }}</span> to confirm.
                    </p>
                    <Input
                        v-model="deleteConfirmText"
                        placeholder="Type integration label here"
                        autofocus
                    />
                </div>
                <div class="flex justify-end gap-2 mt-4">
                    <Button
                        variant="outline"
                        @click="
                            () => {
                                deleteConfirmText = '';
                                close();
                            }
                        "
                        >Cancel</Button
                    >
                    <Button
                        variant="destructive"
                        :disabled="deleteConfirmText !== deletingIntegration?.label"
                        @click="handleDelete"
                        >Delete Integration</Button
                    >
                </div>
            </template>
        </Dialog>

        <!-- Rotate Secret Confirmation Dialog -->
        <Dialog
            :open="showRotateConfirm"
            @update:open="showRotateConfirm = $event"
        >
            <template #default="{close}">
                <h3 class="text-lg font-semibold">Are you sure?</h3>
                <p class="mt-2 text-sm text-muted-foreground">This action will permanently rotate the secret and cannot be undone.</p>
                <div class="flex justify-end gap-2 mt-6">
                    <Button
                        variant="outline"
                        @click="close"
                        >Cancel</Button
                    >
                    <Button
                        variant="destructive"
                        :disabled="isRotating"
                        @click="handleRotateSecret"
                        >{{ isRotating ? 'Rotating…' : 'Rotate' }}</Button
                    >
                </div>
            </template>
        </Dialog>
    </div>
</template>
