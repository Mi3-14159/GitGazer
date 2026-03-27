<script setup lang="ts">
    import Badge from '@/components/ui/Badge.vue';
    import Card from '@/components/ui/Card.vue';
    import CardContent from '@/components/ui/CardContent.vue';
    import Checkbox from '@/components/ui/Checkbox.vue';
    import {formatTimeSince} from '@/utils/formatDate';
    import type {EventLogEntryRow, EventLogType} from '@common/types';
    import {AlertTriangle, Bell, CheckCircle2, ExternalLink, XCircle} from 'lucide-vue-next';
    import {computed} from 'vue';

    const props = defineProps<{
        entry: EventLogEntryRow;
    }>();

    const emit = defineEmits<{
        toggleRead: [id: string, read: boolean];
    }>();

    const TYPE_CONFIG: Record<
        EventLogType,
        {icon: typeof Bell; class: string; variant: 'success' | 'destructive' | 'warning' | 'outline'; label: string}
    > = {
        success: {icon: CheckCircle2, class: 'text-green-500', variant: 'success', label: 'Success'},
        failure: {icon: XCircle, class: 'text-red-500', variant: 'destructive', label: 'Failure'},
        warning: {icon: AlertTriangle, class: 'text-yellow-500', variant: 'warning', label: 'Warning'},
        info: {icon: Bell, class: 'text-blue-500', variant: 'outline', label: 'Info'},
        alert: {icon: Bell, class: 'text-red-500', variant: 'destructive', label: 'Alert'},
    };

    const typeConfig = computed(() => TYPE_CONFIG[props.entry.type] ?? TYPE_CONFIG.info);

    const formattedDate = computed(() => {
        const d = new Date(props.entry.createdAt);
        return d.toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'}) + ' ' + d.toLocaleTimeString();
    });

    const relativeTime = computed(() => formatTimeSince(props.entry.createdAt) ?? '');
</script>

<template>
    <Card :class="['transition-all hover:shadow-md', entry.read ? 'opacity-60' : 'border-l-4 border-l-primary']">
        <CardContent class="p-4">
            <div class="flex items-start gap-3">
                <!-- Checkbox -->
                <Checkbox
                    :model-value="entry.read"
                    :class="[entry.read ? 'data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500' : '', 'mt-1 shrink-0']"
                    @update:model-value="emit('toggleRead', entry.id, !entry.read)"
                />

                <!-- Icon -->
                <component
                    :is="typeConfig.icon"
                    class="h-5 w-5 mt-0.5 shrink-0"
                    :class="typeConfig.class"
                />

                <!-- Content -->
                <div class="flex-1 min-w-0 space-y-2">
                    <div class="flex items-start justify-between gap-2 flex-wrap">
                        <div class="flex-1 min-w-0">
                            <h4 :class="['font-semibold', entry.read ? 'text-muted-foreground' : '']">
                                {{ entry.title }}
                            </h4>
                            <p class="text-sm text-muted-foreground mt-1">
                                {{ entry.message }}
                            </p>
                        </div>
                        <Badge :variant="typeConfig.variant">{{ typeConfig.label }}</Badge>
                    </div>

                    <!-- Metadata -->
                    <div class="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        <span>{{ formattedDate }}</span>
                        <span>•</span>
                        <span>{{ relativeTime }}</span>
                        <template v-if="entry.metadata?.workflowRunId">
                            <span>•</span>
                            <a
                                v-if="entry.metadata?.repository && entry.metadata?.workflowRunId && entry.metadata?.workflowJobId"
                                :href="`https://github.com/${entry.metadata.repository}/actions/runs/${entry.metadata.workflowRunId}/job/${entry.metadata.workflowJobId}`"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="inline-flex items-center gap-1 font-mono hover:text-foreground transition-colors"
                            >
                                Workflow #{{ entry.metadata?.workflowRunId }}
                                <ExternalLink class="h-3 w-3" />
                            </a>
                            <span
                                v-else
                                class="font-mono"
                                >Workflow #{{ entry.metadata?.workflowRunId }}</span
                            >
                        </template>
                    </div>
                </div>
            </div>
        </CardContent>
    </Card>
</template>
