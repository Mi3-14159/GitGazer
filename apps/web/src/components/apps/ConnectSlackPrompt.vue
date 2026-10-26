<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import {useAuth} from '@/composables/useAuth';
    import {useIntegrationApps} from '@/composables/useIntegrationApps';
    import {useMembers} from '@/composables/useMembers';
    import {MessageSquare} from '@lucide/vue';
    import {onMounted, shallowRef} from 'vue';
    import {useRouter} from 'vue-router';

    const props = defineProps<{
        integrationId: string;
    }>();

    const {listApps, slackConnectUrl} = useIntegrationApps();
    const {getMembers} = useMembers();
    const {getUserAttributes, refreshSession} = useAuth();
    const router = useRouter();

    const dismissedKey = `gitgazer:slack-prompt-dismissed:${props.integrationId}`;
    const visible = shallowRef(false);
    const connecting = shallowRef(false);

    function isDismissed(): boolean {
        try {
            return localStorage.getItem(dismissedKey) === '1';
        } catch {
            return false;
        }
    }

    onMounted(async () => {
        if (isDismissed()) return;
        try {
            const [apps, members, self] = await Promise.all([listApps(props.integrationId), getMembers(props.integrationId), getUserAttributes()]);
            const slackApp = apps.find((app) => app.type === 'slack');
            const ownRow = members.find((member) => member.userId === self?.userId);
            visible.value = slackApp?.type === 'slack' && !slackApp.workspace.disconnected && ownRow?.slackLinked === false;
        } catch {
            // Only a nudge: without its data it stays hidden.
        }
    });

    function dismiss() {
        visible.value = false;
        try {
            localStorage.setItem(dismissedKey, '1');
        } catch {
            // Storage blocked: the prompt comes back on the next visit.
        }
    }

    async function connect() {
        connecting.value = true;
        try {
            // A long Slack consent screen can outlast the access token the callback needs.
            await refreshSession();
            // Always return to the Members tab: the Apps tab reads the same query params as install outcomes.
            const membersPath = router.resolve({name: 'integration', params: {integrationId: props.integrationId, tab: 'members'}}).href;
            window.location.assign(slackConnectUrl(props.integrationId, window.location.origin + membersPath));
        } finally {
            connecting.value = false;
        }
    }
</script>

<template>
    <div
        v-if="visible"
        class="flex flex-col gap-3 rounded-lg border p-3 text-sm sm:flex-row sm:items-center"
    >
        <p class="flex min-w-0 flex-1 items-center gap-2">
            <MessageSquare
                class="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
            />
            Connect your Slack account to get pinged on your failures.
        </p>
        <div class="flex gap-2">
            <Button
                size="sm"
                :loading="connecting"
                @click="connect"
            >
                Connect Slack
            </Button>
            <Button
                size="sm"
                variant="ghost"
                @click="dismiss"
            >
                Dismiss
            </Button>
        </div>
    </div>
</template>
