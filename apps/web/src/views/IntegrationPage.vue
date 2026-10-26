<script setup lang="ts">
    import AppsTab from '@/components/apps/AppsTab.vue';
    import ConnectSlackPrompt from '@/components/apps/ConnectSlackPrompt.vue';
    import DeleteIntegrationDialog from '@/components/integrations/DeleteIntegrationDialog.vue';
    import IntegrationSettings from '@/components/integrations/IntegrationSettings.vue';
    import LeaveIntegrationDialog from '@/components/integrations/LeaveIntegrationDialog.vue';
    import IntegrationMembers from '@/components/members/IntegrationMembers.vue';
    import EmptyState from '@/components/ui/EmptyState.vue';
    import Skeleton from '@/components/ui/Skeleton.vue';
    import Tabs from '@/components/ui/Tabs.vue';
    import TabsContent from '@/components/ui/TabsContent.vue';
    import TabsList from '@/components/ui/TabsList.vue';
    import TabsTrigger from '@/components/ui/TabsTrigger.vue';
    import {useIntegrationCrud} from '@/composables/useIntegrationCrud';
    import {ChevronRight, Plug} from '@lucide/vue';
    import {computed, onMounted, ref, watch} from 'vue';
    import {RouterLink, useRoute, useRouter} from 'vue-router';

    const route = useRoute();
    const router = useRouter();

    const {
        integrations,
        refreshIntegrations,
        handleSaveLabel,
        showDeleteConfirm,
        deletingIntegration,
        confirmDelete,
        handleDelete,
        showLeaveConfirm,
        leavingIntegration,
        isLeaving,
        confirmLeave,
        handleLeave,
    } = useIntegrationCrud();

    const integrationId = computed(() => route.params.integrationId as string);
    const tab = computed(() => route.params.tab as string);
    const integration = computed(() => integrations.value.find((i) => i.integrationId === integrationId.value));

    const isLoading = ref(true);
    const loadError = ref<string | null>(null);

    async function load() {
        isLoading.value = true;
        loadError.value = null;
        try {
            await refreshIntegrations();
        } catch (e) {
            loadError.value = e instanceof Error ? e.message : 'Failed to load integration';
        } finally {
            isLoading.value = false;
        }
    }

    onMounted(load);

    // The router's afterEach sets the generic title on every navigation; this runs after it.
    watch(
        [() => integration.value?.label, () => route.fullPath],
        ([label]) => {
            if (label) document.title = `${label} | GitGazer`;
        },
        {immediate: true},
    );

    function selectTab(value: string) {
        router.push({name: 'integration', params: {integrationId: integrationId.value, tab: value}});
    }

    async function onSaveLabel(id: string, label: string) {
        await handleSaveLabel(id, label);
    }

    async function onDelete() {
        await handleDelete();
        await router.push({name: 'integrations'});
    }

    async function onLeave() {
        await handleLeave();
        await router.push({name: 'integrations'});
    }
</script>

<template>
    <div class="space-y-4 p-4">
        <div
            v-if="isLoading"
            class="space-y-3"
        >
            <Skeleton class="h-4 w-40" />
            <Skeleton class="h-8 w-72" />
            <Skeleton class="h-9 w-64" />
        </div>

        <EmptyState
            v-else-if="loadError || !integration"
            :icon="Plug"
            :message="loadError ?? 'This integration does not exist or you are not a member.'"
            action-label="Back to integrations"
            @action="router.push({name: 'integrations'})"
        />

        <template v-else>
            <header>
                <nav aria-label="Breadcrumb">
                    <ol class="flex items-center gap-1 text-sm text-muted-foreground">
                        <li>
                            <RouterLink
                                :to="{name: 'integrations'}"
                                class="hover:text-foreground hover:underline"
                            >
                                Integrations
                            </RouterLink>
                        </li>
                        <li aria-hidden="true">
                            <ChevronRight class="h-3.5 w-3.5" />
                        </li>
                        <li
                            class="min-w-0 truncate text-foreground"
                            aria-current="page"
                        >
                            {{ integration.label }}
                        </li>
                    </ol>
                </nav>
                <h1 class="sr-only">{{ integration.label }}</h1>
            </header>

            <ConnectSlackPrompt
                :key="integration.integrationId"
                :integration-id="integration.integrationId"
            />

            <!-- The router reuses this view across integrations; the keys below remount each tab so it loads the new one -->
            <Tabs
                :model-value="tab"
                @update:model-value="selectTab"
            >
                <TabsList>
                    <TabsTrigger value="apps">Apps</TabsTrigger>
                    <TabsTrigger value="members">Members</TabsTrigger>
                    <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>

                <TabsContent
                    value="apps"
                    class="pt-2"
                >
                    <AppsTab
                        :key="integration.integrationId"
                        :integration="integration"
                        @integration-changed="refreshIntegrations"
                    />
                </TabsContent>
                <TabsContent
                    value="members"
                    class="pt-2"
                >
                    <IntegrationMembers
                        :key="integration.integrationId"
                        :integration-id="integration.integrationId"
                        :role="integration.role"
                    />
                </TabsContent>
                <TabsContent
                    value="settings"
                    class="pt-2"
                >
                    <IntegrationSettings
                        :key="integration.integrationId"
                        :integration="integration"
                        @save-label="onSaveLabel"
                        @delete="confirmDelete"
                        @leave="confirmLeave"
                    />
                </TabsContent>
            </Tabs>
        </template>

        <DeleteIntegrationDialog
            :open="showDeleteConfirm"
            :integration="deletingIntegration"
            @update:open="showDeleteConfirm = $event"
            @confirm="onDelete"
        />
        <LeaveIntegrationDialog
            :open="showLeaveConfirm"
            :integration="leavingIntegration"
            :is-leaving="isLeaving"
            @update:open="showLeaveConfirm = $event"
            @confirm="onLeave"
        />
    </div>
</template>
