<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Dialog from '@/components/ui/Dialog.vue';
    import Input from '@/components/ui/Input.vue';
    import Tabs from '@/components/ui/Tabs.vue';
    import TabsContent from '@/components/ui/TabsContent.vue';
    import TabsList from '@/components/ui/TabsList.vue';
    import TabsTrigger from '@/components/ui/TabsTrigger.vue';
    import {useMcp} from '@/composables/useMcp';
    import {copyToClipboard} from '@/utils/clipboard';
    import {BookOpen, Check, Copy, ShieldCheck, Sparkles} from '@lucide/vue';
    import {onUnmounted, ref} from 'vue';

    const {mcpUrl, mcpClients, mcpExampleQuestions, docsUrl, isConnectDialogOpen} = useMcp();

    const activeClient = ref(mcpClients[0].id);
    const copiedKey = ref<string | null>(null);
    let copiedTimer: ReturnType<typeof setTimeout> | null = null;

    function onOpenChange(open: boolean) {
        isConnectDialogOpen.value = open;
    }

    async function copy(key: string, text: string) {
        await copyToClipboard(text);
        copiedKey.value = key;
        if (copiedTimer) clearTimeout(copiedTimer);
        copiedTimer = setTimeout(() => {
            copiedKey.value = null;
        }, 2000);
    }

    onUnmounted(() => {
        if (copiedTimer) clearTimeout(copiedTimer);
    });
</script>

<template>
    <Dialog
        :open="isConnectDialogOpen"
        class="max-w-2xl"
        @update:open="onOpenChange"
    >
        <template #default="{close}">
            <div class="flex items-start gap-3">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Sparkles class="h-5 w-5 text-primary" />
                </div>
                <div class="space-y-1">
                    <h2 class="text-lg font-semibold leading-none tracking-tight">Ask your CI data anything</h2>
                    <p class="text-sm text-muted-foreground">
                        GitGazer speaks MCP, so VS Code, Claude Code, or Claude Desktop can answer questions about your workflow data in plain English
                        — no SQL, no export.
                    </p>
                </div>
            </div>

            <!-- Endpoint -->
            <div class="mt-5 space-y-1">
                <div class="text-xs font-medium text-muted-foreground">Your MCP endpoint</div>
                <div class="flex items-center gap-1">
                    <Input
                        :model-value="mcpUrl"
                        type="text"
                        readonly
                        class="font-mono text-xs !h-8 !px-2"
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        class="h-8 w-8 p-0 shrink-0"
                        :title="copiedKey === 'endpoint' ? 'Copied' : 'Copy endpoint'"
                        @click="copy('endpoint', mcpUrl)"
                    >
                        <Check
                            v-if="copiedKey === 'endpoint'"
                            class="h-3 w-3 text-success"
                        />
                        <Copy
                            v-else
                            class="h-3 w-3"
                        />
                    </Button>
                </div>
            </div>

            <!-- Per-client setup -->
            <Tabs
                v-model="activeClient"
                class="mt-5"
            >
                <TabsList>
                    <TabsTrigger
                        v-for="client in mcpClients"
                        :key="client.id"
                        :value="client.id"
                    >
                        {{ client.label }}
                    </TabsTrigger>
                </TabsList>

                <TabsContent
                    v-for="client in mcpClients"
                    :key="client.id"
                    :value="client.id"
                    class="space-y-2"
                >
                    <p class="text-sm text-muted-foreground">{{ client.intro }}</p>
                    <div class="relative">
                        <div
                            v-if="client.fileHint"
                            class="rounded-t-lg border border-b-0 bg-muted/50 px-3 py-1 font-mono text-xs text-muted-foreground"
                        >
                            {{ client.fileHint }}
                        </div>
                        <pre
                            :class="[
                                'overflow-x-auto border bg-muted/30 p-3 pr-11 font-mono text-xs',
                                client.fileHint ? 'rounded-b-lg' : 'rounded-lg',
                            ]"
                            >{{ client.code }}</pre>
                        <Button
                            variant="ghost"
                            size="sm"
                            :class="['absolute right-1 h-7 w-7 p-0', client.fileHint ? 'top-8' : 'top-1']"
                            :title="copiedKey === client.id ? 'Copied' : 'Copy snippet'"
                            @click="copy(client.id, client.code)"
                        >
                            <Check
                                v-if="copiedKey === client.id"
                                class="h-3 w-3 text-success"
                            />
                            <Copy
                                v-else
                                class="h-3 w-3"
                            />
                        </Button>
                    </div>
                    <p class="text-xs text-muted-foreground">{{ client.outro }}</p>
                </TabsContent>
            </Tabs>

            <!-- Example questions -->
            <div class="mt-5 space-y-2">
                <div class="text-xs font-medium text-muted-foreground">Then just ask</div>
                <ul class="space-y-1">
                    <li
                        v-for="question in mcpExampleQuestions"
                        :key="question"
                        class="flex items-start gap-2 text-sm"
                    >
                        <Sparkles class="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60" />
                        <span class="text-muted-foreground">&ldquo;{{ question }}&rdquo;</span>
                    </li>
                </ul>
            </div>

            <p class="mt-4 flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                <ShieldCheck class="mt-px h-3.5 w-3.5 shrink-0 text-success" />
                <span>
                    Read-only, and scoped to the integrations you already have access to. The assistant signs in as you with GitHub — no API keys to
                    copy — and cannot change settings or read webhook secrets.
                </span>
            </p>

            <div class="mt-5 flex items-center justify-between gap-2">
                <a
                    :href="docsUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <BookOpen class="h-3.5 w-3.5" />
                    Full guide
                    <span class="text-xs">&nearr;</span>
                </a>
                <Button @click="close">Done</Button>
            </div>
        </template>
    </Dialog>
</template>
