<script setup lang="ts">
    import StatusBadge from '@/components/ui/StatusBadge.vue';
    import type {ColumnConfig} from '@/types/table';
    import {formatDuration} from '@/utils/status';
    import type {WorkflowJob} from '@common/types';
    import {formatDistanceToNow} from 'date-fns';
    import {Server} from 'lucide-vue-next';

    defineProps<{
        job: WorkflowJob;
        visibleColumns: ColumnConfig[];
    }>();

    const emit = defineEmits<{
        click: [job: WorkflowJob];
    }>();
</script>

<template>
    <tr
        class="border-b bg-muted/20 hover:bg-muted/30 transition-colors text-xs cursor-pointer"
        @click.stop="emit('click', job)"
    >
        <td class="py-1.5 px-3"></td>
        <td
            v-for="column in visibleColumns"
            :key="column.id"
            class="py-1.5 px-3"
        >
            <template v-if="column.id === 'workflow'">
                <div class="flex items-center gap-1.5 pl-4">
                    <Server class="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    <span class="font-medium">{{ job.name }}</span>
                </div>
            </template>
            <template v-else-if="column.id === 'repository'">
                <span class="font-mono text-muted-foreground">{{ job.runnerGroupName }}</span>
            </template>
            <template v-else-if="column.id === 'status'">
                <StatusBadge
                    :status="job.conclusion || job.status || ''"
                    size="sm"
                />
            </template>
            <template v-else-if="column.id === 'duration'">
                <span class="font-mono">{{ formatDuration(job.startedAt, job.completedAt) }}</span>
            </template>
            <template v-else-if="column.id === 'created'">
                <span class="text-muted-foreground whitespace-nowrap">
                    {{ job.createdAt ? formatDistanceToNow(new Date(job.createdAt), {addSuffix: true}) : '' }}
                </span>
            </template>
            <template v-else-if="column.id === 'started'">
                <span class="text-muted-foreground whitespace-nowrap">
                    {{ job.startedAt ? formatDistanceToNow(new Date(job.startedAt), {addSuffix: true}) : '' }}
                </span>
            </template>
        </td>
    </tr>
</template>
