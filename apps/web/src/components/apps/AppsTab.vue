<script setup lang="ts">
    import AppCard from '@/components/apps/AppCard.vue';
    import AppCatalog from '@/components/apps/AppCatalog.vue';
    import {APP_INFO, type AppStat} from '@/components/apps/appCatalog';
    import GithubAppPanel from '@/components/apps/GithubAppPanel.vue';
    import SlackAppPanel from '@/components/apps/SlackAppPanel.vue';
    import UninstallAppDialog from '@/components/apps/UninstallAppDialog.vue';
    import WebhookAppPanel from '@/components/apps/WebhookAppPanel.vue';
    import Button from '@/components/ui/Button.vue';
    import Skeleton from '@/components/ui/Skeleton.vue';
    import {useAuth} from '@/composables/useAuth';
    import {useIntegrationApps} from '@/composables/useIntegrationApps';
    import {hasRole, INTEGRATION_APP_TYPES, type IntegrationApp, type IntegrationAppType, type IntegrationWithRole} from '@common/types';
    import {computed, onMounted, shallowRef} from 'vue';
    import {useRoute, useRouter} from 'vue-router';

    const props = defineProps<{
        integration: IntegrationWithRole;
    }>();

    const emit = defineEmits<{
        'integration-changed': [];
    }>();

    const {listApps, installApp, uninstallApp, slackInstallUrl} = useIntegrationApps();
    const {refreshSession} = useAuth();
    const route = useRoute();
    const router = useRouter();

    const apps = shallowRef<IntegrationApp[]>([]);
    const isLoading = shallowRef(true);
    const loadError = shallowRef<string | null>(null);
    const selectedType = shallowRef<IntegrationAppType | null>(null);
    const installing = shallowRef<IntegrationAppType | null>(null);
    const installError = shallowRef<string | null>(null);
    const installNotice = shallowRef<string | null>(null);

    const uninstallType = shallowRef<IntegrationAppType | null>(null);
    const showUninstall = shallowRef(false);
    const isUninstalling = shallowRef(false);
    const uninstallError = shallowRef<string | null>(null);

    const canManage = computed(() => hasRole(props.integration.role, 'admin'));

    const installed = computed(() =>
        INTEGRATION_APP_TYPES.flatMap((type) => apps.value.filter((app) => app.type === type)).map((app) => ({app, stats: statsFor(app)})),
    );
    const installable = computed(() => INTEGRATION_APP_TYPES.filter((type) => !apps.value.some((app) => app.type === type)));
    const githubApp = computed(() => apps.value.find((app) => app.type === 'github'));
    const webhookApp = computed(() => apps.value.find((app) => app.type === 'webhook'));
    const slackApp = computed(() => apps.value.find((app) => app.type === 'slack'));

    const ROLE_LABELS = {viewer: 'Viewer', member: 'Member', admin: 'Admin'} as const;

    const SLACK_INSTALL_ERRORS: Record<string, string> = {
        enterprise: "Org-wide installs aren't supported — install the app into a workspace.",
        workspace_mismatch: 'This integration already uses another Slack workspace — remove the Slack app first.',
    };

    function plural(count: number, one: string, many: string): string {
        return count === 1 ? one : many;
    }

    function statsFor(app: IntegrationApp): AppStat[] {
        if (app.type === 'github') {
            const count = props.integration.githubAppInstallations?.length ?? 0;
            return [
                {value: count, after: plural(count, 'installation', 'installations')},
                {before: 'Org sync role', value: ROLE_LABELS[app.settings.orgSyncDefaultRole]},
            ];
        }
        if (app.type === 'slack') {
            return [
                {value: app.workspace.teamName, after: app.workspace.disconnected ? '· Disconnected' : undefined},
                {value: app.handles.length, after: plural(app.handles.length, 'channel', 'channels')},
                {value: app.linkedMemberCount, after: 'linked'},
            ];
        }
        const rules = app.handles.reduce((sum, handle) => sum + handle.ruleCount, 0);
        return [
            {value: app.handles.length, after: plural(app.handles.length, 'handle', 'handles')},
            {value: rules, after: plural(rules, 'rule', 'rules')},
        ];
    }

    function panelId(type: IntegrationAppType): string {
        return `app-panel-${type}`;
    }

    function errorMessage(e: unknown, fallback: string): string {
        return e instanceof Error ? e.message : fallback;
    }

    async function loadApps() {
        loadError.value = null;
        try {
            apps.value = await listApps(props.integration.integrationId);
        } catch (e) {
            loadError.value = errorMessage(e, 'Failed to load apps');
        } finally {
            isLoading.value = false;
        }
    }

    function retry() {
        isLoading.value = true;
        loadApps();
    }

    function showSlackInstallOutcome() {
        const {slack, slack_error: slackError, ...query} = route.query;
        if (slack === undefined && slackError === undefined) return;
        if (slack === 'installed') {
            installNotice.value = 'Slack app installed.';
            selectedType.value = 'slack';
        } else if (slackError !== undefined) {
            installError.value = SLACK_INSTALL_ERRORS[String(slackError)] ?? 'Installing the Slack app failed. Try again.';
        }
        router.replace({query});
    }

    onMounted(() => {
        showSlackInstallOutcome();
        loadApps();
    });

    function toggle(type: IntegrationAppType) {
        selectedType.value = selectedType.value === type ? null : type;
    }

    async function install(type: IntegrationAppType) {
        installing.value = type;
        installError.value = null;
        installNotice.value = null;
        try {
            if (type === 'slack') {
                // A long Slack consent screen can outlast the access token the callback needs.
                await refreshSession();
                window.location.assign(slackInstallUrl(props.integration.integrationId, window.location.origin + window.location.pathname));
                return;
            }
            await installApp(props.integration.integrationId, type);
            await loadApps();
            selectedType.value = type;
        } catch (e) {
            installError.value = errorMessage(e, 'Failed to install the app');
        } finally {
            installing.value = null;
        }
    }

    function confirmUninstall(type: IntegrationAppType) {
        uninstallType.value = type;
        uninstallError.value = null;
        showUninstall.value = true;
    }

    async function uninstall() {
        const app = apps.value.find((a) => a.type === uninstallType.value);
        if (!app) return;
        isUninstalling.value = true;
        uninstallError.value = null;
        try {
            await uninstallApp(props.integration.integrationId, app.appId);
            showUninstall.value = false;
            selectedType.value = null;
            await loadApps();
            if (app.type === 'github') emit('integration-changed');
        } catch (e) {
            uninstallError.value = errorMessage(e, 'Failed to remove the app');
        } finally {
            isUninstalling.value = false;
        }
    }
</script>

<template>
    <div class="space-y-6">
        <div
            v-if="isLoading"
            class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            aria-busy="true"
        >
            <Skeleton class="h-28 rounded-xl" />
            <Skeleton class="h-28 rounded-xl" />
        </div>

        <div
            v-else-if="loadError"
            class="flex flex-col items-start gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
        >
            <p
                role="alert"
                class="text-sm text-destructive"
            >
                {{ loadError }}
            </p>
            <Button
                variant="outline"
                size="sm"
                @click="retry"
            >
                Retry
            </Button>
        </div>

        <template v-else>
            <section aria-labelledby="apps-installed-heading">
                <h2
                    id="apps-installed-heading"
                    class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                    Installed
                </h2>
                <p
                    v-if="installed.length === 0"
                    class="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground"
                >
                    No apps installed.
                    <template v-if="canManage">Install one from the list below.</template>
                </p>
                <ul
                    v-else
                    class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                >
                    <li
                        v-for="{app, stats} in installed"
                        :key="app.appId"
                    >
                        <AppCard
                            :info="APP_INFO[app.type]"
                            :stats="stats"
                            :selected="selectedType === app.type"
                            :controls="panelId(app.type)"
                            @select="toggle(app.type)"
                        />
                    </li>
                </ul>

                <div
                    v-if="selectedType === 'github' && githubApp?.type === 'github'"
                    :id="panelId('github')"
                    class="mt-4"
                >
                    <GithubAppPanel
                        :integration="integration"
                        :app="githubApp"
                        :can-manage="canManage"
                        @changed="loadApps"
                        @integration-changed="emit('integration-changed')"
                        @remove="confirmUninstall('github')"
                    />
                </div>
                <div
                    v-if="selectedType === 'webhook' && webhookApp?.type === 'webhook'"
                    :id="panelId('webhook')"
                    class="mt-4"
                >
                    <WebhookAppPanel
                        :integration-id="integration.integrationId"
                        :app="webhookApp"
                        :can-manage="canManage"
                        @changed="loadApps"
                        @remove="confirmUninstall('webhook')"
                    />
                </div>
                <div
                    v-if="selectedType === 'slack' && slackApp?.type === 'slack'"
                    :id="panelId('slack')"
                    class="mt-4"
                >
                    <SlackAppPanel
                        :integration-id="integration.integrationId"
                        :app="slackApp"
                        :can-manage="canManage"
                        @changed="loadApps"
                        @reinstall="install('slack')"
                        @remove-webhook="confirmUninstall('webhook')"
                        @remove="confirmUninstall('slack')"
                    />
                </div>
            </section>

            <p
                v-if="installError"
                role="alert"
                class="text-sm text-destructive"
            >
                {{ installError }}
            </p>
            <p
                v-if="installNotice"
                role="status"
                class="text-sm text-muted-foreground"
            >
                {{ installNotice }}
            </p>

            <AppCatalog
                v-if="installable.length > 0"
                :installable="installable"
                :can-install="canManage"
                :installing="installing"
                @install="install"
            />
        </template>

        <UninstallAppDialog
            :open="showUninstall"
            :type="uninstallType"
            :removing="isUninstalling"
            :error="uninstallError"
            @update:open="showUninstall = $event"
            @confirm="uninstall"
        />
    </div>
</template>
