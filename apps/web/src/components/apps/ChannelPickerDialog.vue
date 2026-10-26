<script setup lang="ts">
    import SlackChannelsState from '@/components/apps/SlackChannelsState.vue';
    import Button from '@/components/ui/Button.vue';
    import Dialog from '@/components/ui/Dialog.vue';
    import {useSlackChannels} from '@/composables/useSlackChannels';
    import {Lock} from '@lucide/vue';
    import {shallowRef, watch} from 'vue';

    const props = defineProps<{
        open: boolean;
        integrationId: string;
        appId: string;
        saving: boolean;
        error: string | null;
    }>();

    const emit = defineEmits<{
        'update:open': [value: boolean];
        submit: [channelId: string];
    }>();

    const {channels, loading, loadError, load} = useSlackChannels(
        () => props.integrationId,
        () => props.appId,
    );
    const selected = shallowRef<string | null>(null);

    watch(
        () => props.open,
        (open) => {
            if (!open) return;
            selected.value = null;
            // Reload on every open so a channel the app was just invited to shows up.
            load();
        },
        {immediate: true},
    );

    function submit() {
        if (selected.value) emit('submit', selected.value);
    }
</script>

<template>
    <Dialog
        :open="open"
        @update:open="emit('update:open', $event)"
    >
        <form
            novalidate
            @submit.prevent="submit"
        >
            <h3 class="text-lg font-semibold">Add channel</h3>
            <p class="mt-1 text-sm text-muted-foreground">
                GitGazer posts alerts to the channel. The handle is named after the channel; you can rename it later.
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
                <fieldset class="mt-5">
                    <legend class="mb-2 text-sm font-medium">Channel</legend>
                    <ul class="max-h-72 divide-y overflow-y-auto rounded-lg border">
                        <li
                            v-for="channel in list"
                            :key="channel.id"
                            class="flex items-center gap-3 px-3"
                        >
                            <input
                                :id="`channel-${channel.id}`"
                                v-model="selected"
                                type="radio"
                                name="slack-channel"
                                :value="channel.id"
                                class="size-4 shrink-0 accent-primary"
                            />
                            <label
                                :for="`channel-${channel.id}`"
                                class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-2.5 text-sm"
                            >
                                <span class="truncate">#{{ channel.name }}</span>
                                <span
                                    v-if="channel.isPrivate"
                                    class="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
                                >
                                    <Lock
                                        class="size-3"
                                        aria-hidden="true"
                                    />
                                    private
                                </span>
                            </label>
                        </li>
                    </ul>
                </fieldset>
            </SlackChannelsState>

            <p
                v-if="error"
                role="alert"
                class="mt-4 text-sm text-destructive"
            >
                {{ error }}
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
                    :loading="saving"
                    :disabled="!selected"
                >
                    Add channel
                </Button>
            </div>
        </form>
    </Dialog>
</template>
