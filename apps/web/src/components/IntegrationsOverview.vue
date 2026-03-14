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
        Calendar,
        Check,
        CheckCircle2,
        Copy,
        ExternalLink,
        Eye,
        EyeOff,
        Github,
        Key,
        Pencil,
        Plug,
        Plus,
        Trash2,
        Webhook,
        XCircle,
        Zap,
    } from 'lucide-vue-next';
    import {onMounted, ref} from 'vue';

    const IMPORT_URL_BASE = import.meta.env.VITE_IMPORT_URL_BASE;

    const {getIntegrations, isLoadingIntegrations, createIntegration, updateIntegration, deleteIntegration} = useIntegration();
    const {linkInstallation} = useGithubApp();

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

    // Webhook events

    onMounted(async () => {
        const data = await getIntegrations();
        if (data) integrations.value = data;
    });

    function getStatus(integration: Integration): 'active' | 'inactive' {
        return integration.githubAppInstallations && integration.githubAppInstallations.length > 0 ? 'active' : 'inactive';
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

    function openEdit(i: Integration) {
        editingIntegration.value = i;
        showDialog.value = true;
    }

    function confirmDelete(i: Integration) {
        deletingIntegration.value = i;
        showDeleteConfirm.value = true;
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
    <div class="space-y-6 p-4 md:p-6">
        <!-- Header -->
        <div class="flex items-start justify-between">
            <div>
                <div class="flex items-center gap-2">
                    <Plug class="h-5 w-5 text-muted-foreground" />
                    <h2 class="text-lg font-semibold">Integrations</h2>
                </div>
                <p class="text-sm text-muted-foreground mt-1">Manage webhook endpoints, secrets, and GitHub App installations</p>
            </div>
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
                    <div class="flex items-start justify-between gap-4">
                        <div class="space-y-3 flex-1 min-w-0">
                            <!-- Header Row -->
                            <div class="flex items-center gap-2 flex-wrap">
                                <h3 class="font-semibold text-base">{{ integration.label }}</h3>
                                <Badge
                                    v-if="getStatus(integration) === 'active'"
                                    variant="success"
                                    class="gap-1 h-5 text-xs"
                                >
                                    <CheckCircle2 class="h-3 w-3" />
                                    Active
                                </Badge>
                                <Badge
                                    v-else
                                    variant="secondary"
                                    class="gap-1 h-5 text-xs"
                                >
                                    <XCircle class="h-3 w-3" />
                                    Inactive
                                </Badge>
                                <span class="text-xs text-muted-foreground">
                                    <span v-if="getEnabledEvents(integration).length > 0">{{ getEnabledEvents(integration).length }} events</span>
                                    · ↗ {{ formatDate(integration.createdAt) }}
                                </span>
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
                                    </div>
                                </div>
                            </div>

                            <!-- Enabled Webhook Events -->
                            <div
                                v-if="getEnabledEvents(integration).length > 0"
                                class="border-t pt-2"
                            >
                                <div class="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-2">
                                    <Zap class="h-3 w-3" />
                                    Enabled Webhook Events ({{ getEnabledEvents(integration).length }})
                                </div>
                                <div class="flex flex-wrap gap-1">
                                    <Badge
                                        v-for="event in getEnabledEvents(integration)"
                                        :key="event"
                                        variant="secondary"
                                        class="text-xs h-5 px-1.5"
                                    >
                                        {{ formatEventName(event) }}
                                    </Badge>
                                </div>
                            </div>

                            <!-- GitHub App Installations -->
                            <div
                                v-if="integration.githubAppInstallations && integration.githubAppInstallations.length > 0"
                                class="border-t pt-3"
                            >
                                <div
                                    v-for="inst in integration.githubAppInstallations"
                                    :key="inst.installationId"
                                    class="space-y-2"
                                >
                                    <div class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                        <Github class="h-3 w-3" />
                                        GitHub App: {{ inst.accountLogin }}
                                    </div>
                                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                        <div>
                                            <span class="text-muted-foreground">App ID</span>
                                            <p class="font-medium">{{ inst.accountId }}</p>
                                        </div>
                                        <div>
                                            <span class="text-muted-foreground">Installation</span>
                                            <p class="font-medium">inst-{{ inst.installationId }}</p>
                                        </div>
                                        <div>
                                            <span class="text-muted-foreground">Repositories</span>
                                            <p class="font-medium">{{ getRepoNames(inst).length }}</p>
                                        </div>
                                        <div>
                                            <span class="text-muted-foreground">Permissions</span>
                                            <p class="font-medium">{{ getPermissionCount(inst) }}</p>
                                        </div>
                                    </div>
                                    <div
                                        v-if="getRepoNames(inst).length > 0"
                                        class="flex flex-wrap gap-1"
                                    >
                                        <Badge
                                            v-for="repo in getRepoNames(inst)"
                                            :key="repo"
                                            variant="secondary"
                                            class="text-xs h-5 px-1.5 font-mono"
                                        >
                                            {{ repo }}
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

                        <!-- Actions -->
                        <div class="flex gap-1 flex-shrink-0">
                            <Button
                                variant="ghost"
                                size="sm"
                                class="h-8 w-8 p-0"
                                @click="openEdit(integration)"
                            >
                                <Pencil class="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                class="h-8 w-8 p-0"
                                @click="confirmDelete(integration)"
                            >
                                <Trash2 class="h-3.5 w-3.5 text-destructive" />
                            </Button>
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
            @update:open="showDeleteConfirm = $event"
        >
            <template #default="{close}">
                <h3 class="text-lg font-semibold">Delete Integration</h3>
                <p class="mt-2 text-sm text-muted-foreground">
                    Delete "{{ deletingIntegration?.label }}"? All associated notification rules and linked GitHub Apps will be removed.
                </p>
                <div class="flex justify-end gap-2 mt-6">
                    <Button
                        variant="outline"
                        @click="close"
                        >Cancel</Button
                    >
                    <Button
                        variant="destructive"
                        @click="handleDelete"
                        >Delete</Button
                    >
                </div>
            </template>
        </Dialog>
    </div>
</template>
