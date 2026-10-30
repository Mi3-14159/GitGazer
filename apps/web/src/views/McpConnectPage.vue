<script setup lang="ts">
    import AppLogo from '@/components/icons/AppLogo.vue';
    import Button from '@/components/ui/Button.vue';
    import Card from '@/components/ui/Card.vue';
    import {computed, ref} from 'vue';
    import {useRoute} from 'vue-router';

    const route = useRoute();

    const request = computed(() => {
        const value = route.query.request;
        return typeof value === 'string' ? value : '';
    });

    const action = `${import.meta.env.VITE_REST_API_ENDPOINT}/mcp/oauth/authorize`;

    const options = [
        {value: 'read', label: 'Read only', description: 'Query workflows, PRs and configuration', tools: 'run_sql, list_tables, describe_table'},
        {
            value: 'write',
            label: 'Read & write',
            description: 'Everything above, plus change notification rules',
            tools: 'create / update / delete notification rules, needs the member role in that integration',
        },
    ] as const;

    const session = ref<'read' | 'write'>('read');
    const buttonLabel = computed(() => (session.value === 'write' ? 'Allow read & write access' : 'Allow read access'));
</script>

<template>
    <div class="min-h-screen flex items-center justify-center bg-background px-4 py-8">
        <main class="w-full max-w-sm space-y-6">
            <div class="text-center space-y-2">
                <AppLogo
                    size="lg"
                    class="mx-auto mb-4"
                />
                <h1 class="text-2xl font-bold">Connect an MCP client</h1>
            </div>

            <Card
                v-if="!request"
                class="p-5"
            >
                <p
                    role="alert"
                    class="text-sm"
                >
                    This link is incomplete. Start the connection from your MCP client again.
                </p>
            </Card>

            <form
                v-else
                method="post"
                :action="action"
                class="space-y-6"
            >
                <input
                    type="hidden"
                    name="request"
                    :value="request"
                />

                <fieldset class="space-y-3">
                    <legend class="mb-3 text-center text-muted-foreground">Choose what this client may do</legend>
                    <label
                        v-for="option in options"
                        :key="option.value"
                        :class="[
                            'flex cursor-pointer items-start gap-3 rounded-xl border p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                            session === option.value ? 'border-primary bg-accent' : 'bg-card',
                        ]"
                    >
                        <input
                            v-model="session"
                            type="radio"
                            name="session"
                            :value="option.value"
                            class="mt-1 h-4 w-4 shrink-0 accent-primary"
                        />
                        <span class="space-y-1">
                            <span class="block text-sm font-medium">{{ option.label }}</span>
                            <span class="block text-sm text-muted-foreground">{{ option.description }}</span>
                            <span class="block text-xs text-muted-foreground">{{ option.tools }}</span>
                        </span>
                    </label>
                </fieldset>

                <Button
                    type="submit"
                    class="w-full"
                    size="lg"
                >
                    {{ buttonLabel }}
                </Button>
            </form>
        </main>
    </div>
</template>
