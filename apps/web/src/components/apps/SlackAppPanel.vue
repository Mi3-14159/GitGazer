<script setup lang="ts">
    import AppIcon from '@/components/apps/AppIcon.vue';
    import {APP_INFO} from '@/components/apps/appCatalog';
    import ChannelPickerDialog from '@/components/apps/ChannelPickerDialog.vue';
    import DeleteHandleDialog from '@/components/apps/DeleteHandleDialog.vue';
    import HandleDialog from '@/components/apps/HandleDialog.vue';
    import Button from '@/components/ui/Button.vue';
    import DropdownMenu from '@/components/ui/DropdownMenu.vue';
    import {useIntegrationApps} from '@/composables/useIntegrationApps';
    import {MAX_SLACK_HANDLES, type IntegrationApp, type NotificationHandle} from '@common/types';
    import {MoreHorizontal, Pencil, Plus, Trash2, TriangleAlert} from '@lucide/vue';
    import {DropdownMenuItem} from 'radix-vue';
    import {computed, shallowRef} from 'vue';

    const props = defineProps<{
        integrationId: string;
        app: Extract<IntegrationApp, {type: 'slack'}>;
        canManage: boolean;
    }>();

    const emit = defineEmits<{
        changed: [];
        remove: [];
        reinstall: [];
    }>();

    const {createSlackHandle, updateHandle, deleteHandle} = useIntegrationApps();

    const disconnected = computed(() => props.app.workspace.disconnected);
    const atLimit = computed(() => props.app.handles.length >= MAX_SLACK_HANDLES);

    const pickerOpen = shallowRef(false);
    const adding = shallowRef(false);
    const addError = shallowRef<string | null>(null);

    const renameOpen = shallowRef(false);
    const renamingHandle = shallowRef<NotificationHandle | null>(null);
    const renaming = shallowRef(false);
    const renameError = shallowRef<string | null>(null);

    const deleteOpen = shallowRef(false);
    const deletingHandle = shallowRef<NotificationHandle | null>(null);
    const deleting = shallowRef(false);
    const deleteError = shallowRef<string | null>(null);

    function openPicker() {
        addError.value = null;
        pickerOpen.value = true;
    }

    async function add(channelId: string) {
        adding.value = true;
        addError.value = null;
        try {
            await createSlackHandle(props.integrationId, props.app.appId, {channelId});
            pickerOpen.value = false;
            emit('changed');
        } catch (e) {
            addError.value = e instanceof Error ? e.message : 'Failed to add the channel';
        } finally {
            adding.value = false;
        }
    }

    function openRename(handle: NotificationHandle) {
        renamingHandle.value = handle;
        renameError.value = null;
        renameOpen.value = true;
    }

    async function rename(input: {name: string}) {
        if (!renamingHandle.value) return;
        renaming.value = true;
        renameError.value = null;
        try {
            await updateHandle(props.integrationId, renamingHandle.value.handleId, {name: input.name});
            renameOpen.value = false;
            emit('changed');
        } catch (e) {
            renameError.value = e instanceof Error ? e.message : 'Failed to rename the handle';
        } finally {
            renaming.value = false;
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
        aria-labelledby="slack-app-heading"
    >
        <div class="flex flex-wrap items-center gap-3">
            <AppIcon
                :icon="APP_INFO.slack.icon"
                :tone="APP_INFO.slack.tone.chip"
            />
            <div class="min-w-0 flex-1">
                <h2
                    id="slack-app-heading"
                    class="truncate font-semibold"
                >
                    Slack · {{ app.workspace.teamName }}
                </h2>
                <p class="hidden text-sm text-muted-foreground sm:block">Each handle posts alerts to a channel in this workspace.</p>
            </div>
            <Button
                v-if="canManage"
                class="w-full sm:ml-auto sm:w-auto"
                :disabled="disconnected || atLimit"
                @click="openPicker"
            >
                <Plus
                    class="size-4"
                    aria-hidden="true"
                />
                Add channel
            </Button>
        </div>

        <div
            v-if="disconnected"
            class="mt-4 flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm sm:flex-row sm:items-center"
        >
            <TriangleAlert
                class="hidden size-4 shrink-0 text-warning sm:block"
                aria-hidden="true"
            />
            <div class="min-w-0 flex-1">
                <p class="font-semibold">Disconnected — reinstall</p>
                <p class="text-muted-foreground">
                    GitGazer lost access to this workspace, so alerts to its channels fail. Reinstalling keeps the handles; private channels may need
                    a new <code class="font-mono text-xs">/invite @GitGazer</code>.
                    <template v-if="!canManage">Ask an admin to reinstall the app.</template>
                </p>
            </div>
            <Button
                v-if="canManage"
                variant="outline"
                size="sm"
                class="w-full shrink-0 sm:w-auto"
                @click="emit('reinstall')"
            >
                Reinstall
            </Button>
        </div>
        <p
            v-else-if="canManage && atLimit"
            class="mt-2 text-sm text-muted-foreground"
        >
            This app holds the maximum of {{ MAX_SLACK_HANDLES }} handles. Delete one to add another.
        </p>

        <p
            v-if="app.handles.length === 0"
            class="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"
        >
            No channels yet.
            <template v-if="canManage">Add one to send failure alerts to it.</template>
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
                <span class="col-span-3 row-start-2 truncate text-sm text-muted-foreground sm:col-span-1 sm:row-start-auto">
                    #{{ handle.channelName }}
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
                        @select="openRename(handle)"
                    >
                        <Pencil
                            class="size-4"
                            aria-hidden="true"
                        />
                        Rename
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

        <p class="mt-4 text-sm text-muted-foreground">
            <span class="font-semibold text-foreground">{{ app.linkedMemberCount }}</span>
            of {{ app.memberCount }} {{ app.memberCount === 1 ? 'member' : 'members' }} linked
        </p>

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
                Remove Slack app
            </Button>
        </div>

        <ChannelPickerDialog
            :open="pickerOpen"
            :integration-id="integrationId"
            :app-id="app.appId"
            :saving="adding"
            :error="addError"
            @update:open="pickerOpen = $event"
            @submit="add"
        />
        <HandleDialog
            :open="renameOpen"
            :handle="renamingHandle"
            :saving="renaming"
            :error="renameError"
            name-only
            @update:open="renameOpen = $event"
            @submit="rename"
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
