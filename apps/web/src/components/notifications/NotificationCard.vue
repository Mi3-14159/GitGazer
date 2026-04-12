<script setup lang="ts">
    import NotificationFilters from '@/components/notifications/NotificationFilters.vue';
    import Badge from '@/components/ui/Badge.vue';
    import Button from '@/components/ui/Button.vue';
    import Card from '@/components/ui/Card.vue';
    import CardContent from '@/components/ui/CardContent.vue';
    import Input from '@/components/ui/Input.vue';
    import Switch from '@/components/ui/Switch.vue';
    import {copyToClipboard} from '@/utils/clipboard';
    import {formatDate} from '@/utils/formatDate';
    import type {NotificationRule} from '@common/types';
    import {Calendar, CheckCircle2, Copy, Eye, EyeOff, Filter, Pencil, Trash2, XCircle} from 'lucide-vue-next';
    import {ref} from 'vue';

    const props = defineProps<{
        rule: NotificationRule;
        integrationLabel: string;
        readonly?: boolean;
    }>();

    defineEmits<{
        toggle: [rule: NotificationRule];
        edit: [rule: NotificationRule];
        delete: [rule: NotificationRule];
    }>();

    const showWebhook = ref(false);

    function hasActiveFilters(rule: NotificationRule) {
        const {rule: r} = rule;
        return !!(r.owner || r.repository_name || r.workflow_name || r.head_branch || r.topics?.length);
    }

    function toggleWebhookVisibility() {
        showWebhook.value = !showWebhook.value;
    }
</script>

<template>
    <Card :class="!rule.enabled ? 'opacity-60' : ''">
        <CardContent class="p-4">
            <div class="space-y-3">
                <!-- Top Row: Name + Actions -->
                <div class="flex items-start justify-between gap-2">
                    <div class="flex-1 min-w-0">
                        <h3 class="font-semibold text-base break-words min-w-0">{{ rule.label }}</h3>
                        <p class="text-xs text-muted-foreground mt-0.5">
                            {{ integrationLabel }}
                        </p>
                        <div class="flex items-center gap-1.5 flex-wrap mt-1">
                            <Badge
                                v-if="rule.enabled"
                                variant="success"
                                class="gap-1 h-5 text-xs"
                            >
                                <CheckCircle2 class="h-3 w-3" />
                                Enabled
                            </Badge>
                            <Badge
                                v-else
                                variant="secondary"
                                class="gap-1 h-5 text-xs"
                            >
                                <XCircle class="h-3 w-3" />
                                Disabled
                            </Badge>
                            <Badge
                                v-if="hasActiveFilters(rule)"
                                variant="outline"
                                class="gap-1 h-5 text-xs"
                            >
                                <Filter class="h-3 w-3" />
                                Filtered
                            </Badge>
                            <Badge
                                variant="secondary"
                                class="h-5 text-xs"
                            >
                                {{ rule.channels[0]?.type ?? '—' }}
                            </Badge>
                        </div>
                    </div>

                    <!-- Actions -->
                    <div
                        v-if="!readonly"
                        class="flex items-center gap-1 flex-shrink-0"
                    >
                        <Switch
                            :model-value="rule.enabled"
                            @update:model-value="$emit('toggle', rule)"
                        />
                        <Button
                            variant="ghost"
                            size="sm"
                            class="h-8 w-8 p-0"
                            @click="$emit('edit', rule)"
                        >
                            <Pencil class="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            class="h-8 w-8 p-0"
                            @click="$emit('delete', rule)"
                        >
                            <Trash2 class="h-3.5 w-3.5 text-destructive" />
                        </Button>
                    </div>
                </div>

                <!-- Webhook & Filters Grid -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-1">
                    <!-- Slack Webhook -->
                    <div class="space-y-1">
                        <div class="text-xs font-medium text-muted-foreground">Slack Webhook</div>
                        <div class="flex items-center gap-1">
                            <Input
                                :model-value="rule.channels[0]?.webhook_url ?? ''"
                                :type="showWebhook ? 'text' : 'password'"
                                readonly
                                class="font-mono text-xs !h-8 !px-2"
                            />
                            <Button
                                variant="ghost"
                                size="sm"
                                class="h-8 w-8 p-0 shrink-0"
                                @click="toggleWebhookVisibility"
                            >
                                <EyeOff
                                    v-if="showWebhook"
                                    class="h-3 w-3"
                                />
                                <Eye
                                    v-else
                                    class="h-3 w-3"
                                />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                class="h-8 w-8 p-0 shrink-0"
                                @click="copyToClipboard(rule.channels[0]?.webhook_url ?? '')"
                            >
                                <Copy class="h-3 w-3" />
                            </Button>
                        </div>
                    </div>

                    <!-- Active Filters -->
                    <NotificationFilters
                        v-if="hasActiveFilters(rule)"
                        :rule="rule"
                    />
                </div>

                <!-- Timestamps -->
                <div class="flex items-center gap-3 text-xs text-muted-foreground">
                    <span class="flex items-center gap-1">
                        <Calendar class="h-3 w-3" />
                        Created {{ formatDate(rule.createdAt) }}
                    </span>
                    <span
                        v-if="rule.updatedAt !== rule.createdAt"
                        class="flex items-center gap-1"
                    >
                        Updated {{ formatDate(rule.updatedAt) }}
                    </span>
                </div>
            </div>
        </CardContent>
    </Card>
</template>
