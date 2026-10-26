<script setup lang="ts">
    import MoveWebhooksDialog from '@/components/apps/MoveWebhooksDialog.vue';
    import Button from '@/components/ui/Button.vue';
    import {useIntegrationApps, type MoveCandidate} from '@/composables/useIntegrationApps';
    import {ArrowRightLeft} from '@lucide/vue';
    import {onMounted, shallowRef} from 'vue';

    const props = defineProps<{
        integrationId: string;
        slackAppId: string;
    }>();

    const emit = defineEmits<{
        changed: [];
        'remove-webhook': [];
    }>();

    const {listMoveCandidates} = useIntegrationApps();

    const candidates = shallowRef<MoveCandidate[]>([]);
    const moveOpen = shallowRef(false);

    async function load() {
        try {
            candidates.value = await listMoveCandidates(props.integrationId);
        } catch {
            // Only an offer: without its data it stays hidden.
        }
    }

    onMounted(load);

    function onMoved() {
        load();
        emit('changed');
    }
</script>

<template>
    <div
        v-if="candidates.length > 0"
        class="mt-4 flex flex-col gap-3 rounded-lg border p-3 text-sm sm:flex-row sm:items-center"
    >
        <ArrowRightLeft
            class="hidden size-4 shrink-0 text-muted-foreground sm:block"
            aria-hidden="true"
        />
        <div class="min-w-0 flex-1">
            <p class="font-semibold">
                {{ candidates.length }} Webhook {{ candidates.length === 1 ? 'handle posts' : 'handles post' }} to the Slack workspace
            </p>
            <p class="text-muted-foreground">Move them to Slack channels so their alerts can mention people.</p>
        </div>
        <Button
            variant="outline"
            size="sm"
            class="w-full shrink-0 sm:w-auto"
            @click="moveOpen = true"
        >
            Move to Slack channels
        </Button>
    </div>
    <MoveWebhooksDialog
        :open="moveOpen"
        :integration-id="integrationId"
        :app-id="slackAppId"
        :candidates="candidates"
        @update:open="moveOpen = $event"
        @moved="onMoved"
        @remove-webhook-app="emit('remove-webhook')"
    />
</template>
