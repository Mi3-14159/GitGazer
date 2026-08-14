<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import {useMcp} from '@/composables/useMcp';
    import {Sparkles, X} from '@lucide/vue';
    import {onMounted} from 'vue';

    const props = withDefaults(
        defineProps<{
            /** `card` for a standalone block, `inline` for a compact nudge inside an empty state. */
            variant?: 'card' | 'inline';
        }>(),
        {variant: 'card'},
    );

    const {showHint, dismissHint, openConnectDialog, mcpExampleQuestions, probeIntegrations} = useMcp();

    onMounted(() => {
        void probeIntegrations();
    });
</script>

<template>
    <template v-if="showHint">
        <!-- Compact nudge, for empty states where a full card would shout -->
        <div
            v-if="props.variant === 'inline'"
            data-tour="mcp-hint"
            class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
        >
            <Sparkles class="h-3.5 w-3.5 text-primary/60" />
            <span>Looking for something the filters can&rsquo;t express? Ask an AI assistant instead.</span>
            <button
                class="text-primary underline-offset-4 hover:underline cursor-pointer"
                @click="openConnectDialog"
            >
                Connect one
            </button>
        </div>

        <!-- Standalone card. Deliberately lighter than the content above it: a
             hint that outweighs the dashboards it supplements reads as an ad. -->
        <div
            v-else
            data-tour="mcp-hint"
            class="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4 sm:flex-row sm:items-center sm:gap-4"
        >
            <div class="flex min-w-0 flex-1 items-start gap-3">
                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Sparkles class="h-4 w-4 text-primary" />
                </div>

                <div class="min-w-0 space-y-1">
                    <h3 class="text-sm font-semibold">Need an answer these dashboards don&rsquo;t cover?</h3>
                    <p class="max-w-prose text-sm text-muted-foreground">
                        Point an AI assistant at GitGazer and ask in plain English — it writes the query for you. Works in VS Code, Claude Code, and
                        Claude Desktop.
                    </p>
                    <p class="max-w-prose text-xs italic text-muted-foreground/70">&ldquo;{{ mcpExampleQuestions[0] }}&rdquo;</p>
                </div>
            </div>

            <!-- Dismiss lives beside the CTA rather than in the corner, where it
                 would sit at the button's height and look like part of it. -->
            <div class="flex shrink-0 items-center gap-1 self-end sm:self-center">
                <Button
                    variant="outline"
                    size="sm"
                    @click="openConnectDialog"
                >
                    <Sparkles class="h-3.5 w-3.5" />
                    Connect an assistant
                </Button>
                <button
                    class="rounded-md p-1.5 text-muted-foreground/60 hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
                    title="Dismiss"
                    aria-label="Dismiss"
                    @click="dismissHint"
                >
                    <X class="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    </template>
</template>
