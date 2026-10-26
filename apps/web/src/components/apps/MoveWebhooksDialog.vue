<script setup lang="ts">
    import SlackChannelsState from '@/components/apps/SlackChannelsState.vue';
    import Button from '@/components/ui/Button.vue';
    import Dialog from '@/components/ui/Dialog.vue';
    import {useIntegrationApps, type MoveCandidate, type MoveResult} from '@/composables/useIntegrationApps';
    import {useSlackChannels} from '@/composables/useSlackChannels';
    import {ChevronDown, ExternalLink} from '@lucide/vue';
    import {computed, ref, shallowRef, watch} from 'vue';

    const props = defineProps<{
        open: boolean;
        integrationId: string;
        appId: string;
        candidates: MoveCandidate[];
    }>();

    const emit = defineEmits<{
        'update:open': [value: boolean];
        moved: [];
        'remove-webhook-app': [];
    }>();

    const SLACK_APP_MANAGEMENT_URL = 'https://slack.com/apps/manage';

    const {moveWebhookHandles} = useIntegrationApps();
    const {channels, loading, loadError, load} = useSlackChannels(
        () => props.integrationId,
        () => props.appId,
    );

    // handleId → channelId; an empty value skips the handle
    const choices = ref<Record<string, string>>({});
    const moving = shallowRef(false);
    const moveError = shallowRef<string | null>(null);
    const result = shallowRef<MoveResult | null>(null);
    // The panel refetches the candidates after a move, so the result keeps the names it needs
    const movedFrom = shallowRef<MoveCandidate[]>([]);

    const moves = computed(() =>
        Object.entries(choices.value)
            .filter(([, channelId]) => channelId !== '')
            .map(([webhookHandleId, channelId]) => ({webhookHandleId, channelId})),
    );

    function handleName(handleId: string): string {
        return movedFrom.value.find((c) => c.handleId === handleId)?.name ?? handleId;
    }

    function channelName(handleId: string): string {
        const channelId = choices.value[handleId];
        return channels.value?.find((c) => c.id === channelId)?.name ?? channelId;
    }

    const movedNames = computed(() => result.value?.moved.map(handleName).join(', ') ?? '');
    const failedNames = computed(() => result.value?.failed.map(handleName).join(', ') ?? '');

    watch(
        () => props.open,
        (open) => {
            if (!open) return;
            choices.value = Object.fromEntries(props.candidates.map((c) => [c.handleId, '']));
            moveError.value = null;
            result.value = null;
            load();
        },
        {immediate: true},
    );

    async function submit() {
        if (moves.value.length === 0) return;
        moving.value = true;
        moveError.value = null;
        try {
            movedFrom.value = props.candidates;
            result.value = await moveWebhookHandles(props.integrationId, moves.value);
            emit('moved');
        } catch (e) {
            moveError.value = e instanceof Error ? e.message : 'Failed to move the handles';
        } finally {
            moving.value = false;
        }
    }

    function removeWebhookApp() {
        emit('update:open', false);
        emit('remove-webhook-app');
    }
</script>

<template>
    <Dialog
        :open="open"
        @update:open="emit('update:open', $event)"
    >
        <template v-if="result">
            <h3 class="text-lg font-semibold">Webhook handles moved</h3>
            <p
                role="status"
                class="mt-2 text-sm"
            >
                Moved {{ result.moved.length }} of {{ result.moved.length + result.failed.length }} handles.
            </p>
            <ul
                v-if="result.moved.length > 0"
                class="mt-3 divide-y rounded-lg border text-sm"
            >
                <li
                    v-for="handleId in result.moved"
                    :key="handleId"
                    class="truncate px-3 py-2"
                >
                    {{ handleName(handleId) }} → #{{ channelName(handleId) }}
                </li>
            </ul>
            <p
                v-if="result.failed.length > 0"
                role="alert"
                class="mt-3 text-sm text-destructive"
            >
                Not moved: {{ failedNames }}. They keep sending through their webhooks; try again later.
            </p>

            <div
                v-if="result.moved.length > 0"
                class="mt-4 rounded-lg border p-3 text-sm"
            >
                <p class="font-medium">Remove these webhooks in Slack: {{ movedNames }}</p>
                <p class="mt-1 text-muted-foreground">GitGazer no longer uses them, but their URLs keep working until someone removes them.</p>
                <a
                    :href="SLACK_APP_MANAGEMENT_URL"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="mt-2 inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
                >
                    Open Slack app management
                    <ExternalLink
                        class="size-3.5"
                        aria-hidden="true"
                    />
                    <span class="sr-only">(opens in a new tab)</span>
                </a>
            </div>

            <div
                v-if="result.webhookAppEmpty"
                class="mt-4 flex flex-col gap-3 rounded-lg border p-3 text-sm sm:flex-row sm:items-center"
            >
                <p class="min-w-0 flex-1 text-muted-foreground">The Webhook app has no handles left.</p>
                <Button
                    variant="outline"
                    size="sm"
                    class="text-destructive hover:text-destructive"
                    @click="removeWebhookApp"
                >
                    Remove Webhook app
                </Button>
            </div>

            <div class="mt-6 flex justify-end">
                <Button @click="emit('update:open', false)">Done</Button>
            </div>
        </template>

        <form
            v-else
            novalidate
            @submit.prevent="submit"
        >
            <h3 class="text-lg font-semibold">Move Webhook handles</h3>
            <p class="mt-1 text-sm text-muted-foreground">
                Pick the channel each webhook posts to. Its rules then send through the Slack app instead. Skipped handles stay as they are.
            </p>
            <p class="mt-2 text-sm text-muted-foreground">
                Private channels appear here only after someone runs
                <code class="rounded bg-muted px-1 font-mono text-xs text-foreground">/invite @GitGazer</code>
                in them.
            </p>

            <SlackChannelsState
                v-slot="{channels: list}"
                :channels="channels"
                :loading="loading"
                :error="loadError"
                @retry="load"
            >
                <ul class="mt-5 divide-y rounded-lg border">
                    <li
                        v-for="candidate in candidates"
                        :key="candidate.handleId"
                        class="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
                    >
                        <label
                            :for="`move-${candidate.handleId}`"
                            class="min-w-0 flex-1 text-sm"
                        >
                            <span class="block truncate font-medium">{{ candidate.name }}</span>
                            <span class="text-muted-foreground">{{ candidate.ruleCount }} {{ candidate.ruleCount === 1 ? 'rule' : 'rules' }}</span>
                        </label>
                        <div class="relative sm:w-48">
                            <select
                                :id="`move-${candidate.handleId}`"
                                v-model="choices[candidate.handleId]"
                                class="flex h-9 w-full cursor-pointer appearance-none rounded-lg border border-border bg-input-background px-3 py-1 pr-8 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            >
                                <option value="">Skip</option>
                                <option
                                    v-for="channel in list"
                                    :key="channel.id"
                                    :value="channel.id"
                                >
                                    #{{ channel.name }}{{ channel.isPrivate ? ' (private)' : '' }}
                                </option>
                            </select>
                            <ChevronDown
                                class="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                                aria-hidden="true"
                            />
                        </div>
                    </li>
                </ul>
            </SlackChannelsState>

            <p
                v-if="moveError"
                role="alert"
                class="mt-4 text-sm text-destructive"
            >
                {{ moveError }}
            </p>

            <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                    variant="outline"
                    @click="emit('update:open', false)"
                >
                    Cancel
                </Button>
                <Button
                    type="submit"
                    :loading="moving"
                    :disabled="moves.length === 0"
                >
                    Move handles
                </Button>
            </div>
        </form>
    </Dialog>
</template>
