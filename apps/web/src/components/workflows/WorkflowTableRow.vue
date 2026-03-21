<script setup lang="ts">
    import StatusBadge from '@/components/ui/StatusBadge.vue';
    import WorkflowJobRow from '@/components/workflows/WorkflowJobRow.vue';
    import type {ColumnConfig} from '@/types/table';
    import {formatDuration} from '@/utils/status';
    import type {WorkflowJob, WorkflowRunWithRelations} from '@common/types';
    import {formatDistanceToNow} from 'date-fns';
    import {ChevronDown, ChevronRight, GitBranch, GitCommit, User} from 'lucide-vue-next';

    defineProps<{
        run: WorkflowRunWithRelations;
        visibleColumns: ColumnConfig[];
        expanded: boolean;
    }>();

    const emit = defineEmits<{
        toggle: [id: number];
        'job-click': [job: WorkflowJob];
    }>();
</script>

<template>
    <tr
        class="border-b hover:bg-muted/30 transition-colors cursor-pointer"
        @click="emit('toggle', run.id)"
    >
        <td class="py-2 px-3">
            <component
                :is="expanded ? ChevronDown : ChevronRight"
                class="h-4 w-4 text-muted-foreground"
            />
        </td>
        <td
            v-for="column in visibleColumns"
            :key="column.id"
            class="py-2 px-3 truncate"
        >
            <!-- Workflow -->
            <template v-if="column.id === 'workflow'">
                <div>
                    <div class="font-medium truncate">{{ run.name }}</div>
                    <div class="text-xs text-muted-foreground">#{{ run.runAttempt }}</div>
                </div>
            </template>
            <!-- Repository -->
            <template v-else-if="column.id === 'repository'">
                <div class="font-mono text-xs truncate">{{ run.repository?.name }}</div>
            </template>
            <!-- Branch -->
            <template v-else-if="column.id === 'branch'">
                <div class="flex items-center gap-1 text-xs">
                    <GitBranch class="h-3 w-3 text-muted-foreground" />
                    <span class="truncate">{{ run.headBranch }}</span>
                </div>
            </template>
            <!-- Status -->
            <template v-else-if="column.id === 'status'">
                <StatusBadge
                    :status="run.conclusion || run.status || ''"
                    size="sm"
                />
            </template>
            <!-- Jobs -->
            <template v-else-if="column.id === 'jobs'">
                <div class="flex items-center gap-1">
                    <span class="text-xs font-medium">{{ run.workflowJobs.length }}</span>
                    <span class="text-xs text-muted-foreground"> ({{ run.workflowJobs.filter((j) => j.conclusion === 'success').length }} ✓) </span>
                </div>
            </template>
            <!-- Actor -->
            <template v-else-if="column.id === 'actor'">
                <div class="flex items-center gap-1 text-xs">
                    <User class="h-3 w-3 text-muted-foreground" />
                    <span class="truncate">{{ run.headCommitAuthorName }}</span>
                </div>
            </template>
            <!-- Duration -->
            <template v-else-if="column.id === 'duration'">
                <div class="text-xs font-mono">{{ formatDuration(run.runStartedAt, run.updatedAt) }}</div>
            </template>
            <!-- Created -->
            <template v-else-if="column.id === 'created'">
                <div class="text-xs text-muted-foreground truncate">
                    {{ run.createdAt ? formatDistanceToNow(new Date(run.createdAt), {addSuffix: true}) : '' }}
                </div>
            </template>
            <!-- Started -->
            <template v-else-if="column.id === 'started'">
                <div class="text-xs text-muted-foreground truncate">
                    {{ run.runStartedAt ? formatDistanceToNow(new Date(run.runStartedAt), {addSuffix: true}) : '' }}
                </div>
            </template>
            <!-- Commit -->
            <template v-else-if="column.id === 'commit'">
                <div class="flex items-center gap-1 text-xs font-mono">
                    <GitCommit class="h-3 w-3 text-muted-foreground" />
                    <span class="truncate">{{ run.headCommitMessage }}</span>
                </div>
            </template>
            <!-- Run Number -->
            <template v-else-if="column.id === 'run_number'">
                <div class="text-xs font-mono">#{{ run.runAttempt }}</div>
            </template>
            <!-- Topics -->
            <template v-else-if="column.id === 'topics'">
                <div class="flex items-center gap-1 flex-wrap">
                    <Badge
                        v-for="topic in run.repository?.topics ?? []"
                        :key="topic"
                        variant="secondary"
                        class="text-xs px-1.5 h-5"
                    >
                        {{ topic }}
                    </Badge>
                </div>
            </template>
        </td>
    </tr>
    <!-- Expanded job rows -->
    <template v-if="expanded">
        <WorkflowJobRow
            v-for="job in run.workflowJobs"
            :key="job.id"
            :job="job"
            :visible-columns="visibleColumns"
            @click="emit('job-click', $event)"
        />
    </template>
</template>
