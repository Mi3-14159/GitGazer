<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import {useAuth} from '@/composables/useAuth';
    import {useConnectSlack} from '@/composables/useConnectSlack';
    import {useIntegrationApps} from '@/composables/useIntegrationApps';
    import {useMembers} from '@/composables/useMembers';
    import {MessageSquare} from '@lucide/vue';
    import {onMounted, shallowRef} from 'vue';

    const props = defineProps<{
        integrationId: string;
    }>();

    const {listApps} = useIntegrationApps();
    const {getMembers} = useMembers();
    const {getUserAttributes} = useAuth();

    const dismissedKey = `gitgazer:slack-prompt-dismissed:${props.integrationId}`;
    const visible = shallowRef(false);
    const {connecting, connectError, connect} = useConnectSlack(() => props.integrationId);

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
</script>

<template>
    <div
        v-if="visible"
        class="flex flex-col gap-3 rounded-lg border p-3 text-sm sm:flex-row sm:items-center"
    >
        <div class="min-w-0 flex-1">
            <p class="flex items-center gap-2">
                <MessageSquare
                    class="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                />
                Connect your Slack account to get pinged on your failures.
            </p>
            <p
                v-if="connectError"
                role="alert"
                class="mt-1 text-destructive"
            >
                {{ connectError }}
            </p>
        </div>
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
