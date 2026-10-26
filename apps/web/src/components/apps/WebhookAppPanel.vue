<script setup lang="ts">
    import AppIcon from '@/components/apps/AppIcon.vue';
    import {APP_INFO} from '@/components/apps/appCatalog';
    import DeleteHandleDialog from '@/components/apps/DeleteHandleDialog.vue';
    import HandleDialog from '@/components/apps/HandleDialog.vue';
    import MoveWebhooksOffer from '@/components/apps/MoveWebhooksOffer.vue';
    import Button from '@/components/ui/Button.vue';
    import DropdownMenu from '@/components/ui/DropdownMenu.vue';
    import {useIntegrationApps} from '@/composables/useIntegrationApps';
    import {MAX_WEBHOOK_HANDLES, type IntegrationApp, type NotificationHandle} from '@common/types';
    import {MoreHorizontal, Pencil, Plus, Trash2} from '@lucide/vue';
    import {DropdownMenuItem} from 'radix-vue';
    import {computed, shallowRef} from 'vue';

    const props = defineProps<{
        integrationId: string;
        app: Extract<IntegrationApp, {type: 'webhook'}>;
        slackApp?: Extract<IntegrationApp, {type: 'slack'}>;
        canManage: boolean;
    }>();

    const emit = defineEmits<{
        changed: [];
        remove: [];
    }>();

    const {createHandle, updateHandle, deleteHandle} = useIntegrationApps();

    const atLimit = computed(() => props.app.handles.length >= MAX_WEBHOOK_HANDLES);

    const dialogOpen = shallowRef(false);
    const editingHandle = shallowRef<NotificationHandle | null>(null);
    const saving = shallowRef(false);
    const saveError = shallowRef<string | null>(null);

    const deleteOpen = shallowRef(false);
    const deletingHandle = shallowRef<NotificationHandle | null>(null);
    const deleting = shallowRef(false);
    const deleteError = shallowRef<string | null>(null);

    function host(url: string | null): string {
        if (url === null) return 'hidden';
        try {
            return new URL(url).host;
        } catch {
            return url;
        }
    }

    function openDialog(handle: NotificationHandle | null) {
        editingHandle.value = handle;
        saveError.value = null;
        dialogOpen.value = true;
    }

    async function save(input: {name: string; url: string}) {
        saving.value = true;
        saveError.value = null;
        try {
            if (editingHandle.value) {
                await updateHandle(props.integrationId, editingHandle.value.handleId, input);
            } else {
                await createHandle(props.integrationId, props.app.appId, input);
            }
            dialogOpen.value = false;
            emit('changed');
        } catch (e) {
            saveError.value = e instanceof Error ? e.message : 'Failed to save handle';
        } finally {
            saving.value = false;
        }
    }

    function confirmDelete(handle: NotificationHandle) {
        deletingHandle.value = handle;
        deleteError.value = null;
        deleteOpen.value = true;
    }

    async function remove() {
        if (!deletingHandle.value) return;
        deleting.value = true;
        deleteError.value = null;
        try {
            await deleteHandle(props.integrationId, deletingHandle.value.handleId);
            deleteOpen.value = false;
            emit('changed');
        } catch (e) {
            deleteError.value = e instanceof Error ? e.message : 'Failed to delete handle';
        } finally {
            deleting.value = false;
        }
    }
</script>

<template>
    <section
        class="rounded-xl border bg-card p-4 text-card-foreground shadow-sm"
        aria-labelledby="webhook-app-heading"
    >
        <div class="flex flex-wrap items-center gap-3">
            <AppIcon
                :icon="APP_INFO.webhook.icon"
                :tone="APP_INFO.webhook.tone.chip"
            />
            <div class="min-w-0 flex-1">
                <h2
                    id="webhook-app-heading"
                    class="font-semibold"
                >
                    Webhook · handles
                </h2>
                <p class="hidden text-sm text-muted-foreground sm:block">Each handle is a Slack incoming webhook URL. Only admins see the URLs.</p>
            </div>
            <Button
                v-if="canManage"
                class="w-full sm:ml-auto sm:w-auto"
                :disabled="atLimit"
                @click="openDialog(null)"
            >
                <Plus
                    class="size-4"
                    aria-hidden="true"
                />
                Add handle
            </Button>
        </div>
        <p
            v-if="canManage && atLimit"
            class="mt-2 text-sm text-muted-foreground"
        >
            This app holds the maximum of {{ MAX_WEBHOOK_HANDLES }} handles. Delete one to add another.
        </p>

        <MoveWebhooksOffer
            v-if="canManage && slackApp && !slackApp.workspace.disconnected"
            :integration-id="integrationId"
            :slack-app-id="slackApp.appId"
            @changed="emit('changed')"
            @remove-webhook="emit('remove')"
        />

        <p
            v-if="app.handles.length === 0"
            class="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"
        >
            No handles yet.
            <template v-if="canManage">Add one to send failure alerts to a Slack channel.</template>
        </p>
        <ul
            v-else
            class="mt-4 divide-y border-t"
        >
            <li
                v-for="handle in app.handles"
                :key="handle.handleId"
                class="grid grid-cols-[minmax(0,1fr)_auto_2rem] items-center gap-x-3 gap-y-1 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem_2rem]"
            >
                <span class="truncate font-medium">{{ handle.name }}</span>
                <span class="col-span-3 row-start-2 truncate font-mono text-xs text-muted-foreground sm:col-span-1 sm:row-start-auto">
                    {{ host(handle.url) }}
                </span>
                <span class="text-right text-sm text-muted-foreground sm:text-left">
                    {{ handle.ruleCount }} {{ handle.ruleCount === 1 ? 'rule' : 'rules' }}
                </span>
                <DropdownMenu v-if="canManage">
                    <template #trigger>
                        <Button
                            variant="ghost"
                            size="icon"
                            class="size-8"
                            :aria-label="`Actions for ${handle.name}`"
                        >
                            <MoreHorizontal
                                class="size-4"
                                aria-hidden="true"
                            />
                        </Button>
                    </template>
                    <DropdownMenuItem
                        class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent focus:bg-accent"
                        @select="openDialog(handle)"
                    >
                        <Pencil
                            class="size-4"
                            aria-hidden="true"
                        />
                        Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive outline-none hover:bg-accent focus:bg-accent"
                        @select="confirmDelete(handle)"
                    >
                        <Trash2
                            class="size-4"
                            aria-hidden="true"
                        />
                        Delete
                    </DropdownMenuItem>
                </DropdownMenu>
                <span
                    v-else
                    aria-hidden="true"
                />
            </li>
        </ul>

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
                Remove Webhook app
            </Button>
        </div>

        <HandleDialog
            :open="dialogOpen"
            :handle="editingHandle"
            :saving="saving"
            :error="saveError"
            @update:open="dialogOpen = $event"
            @submit="save"
        />
        <DeleteHandleDialog
            :open="deleteOpen"
            :handle="deletingHandle"
            :deleting="deleting"
            :error="deleteError"
            @update:open="deleteOpen = $event"
            @confirm="remove"
        />
    </section>
</template>
