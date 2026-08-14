<script setup lang="ts">
    import Badge from '@/components/ui/Badge.vue';
    import Card from '@/components/ui/Card.vue';
    import CardContent from '@/components/ui/CardContent.vue';
    import CardDescription from '@/components/ui/CardDescription.vue';
    import CardHeader from '@/components/ui/CardHeader.vue';
    import CardTitle from '@/components/ui/CardTitle.vue';
    import Skeleton from '@/components/ui/Skeleton.vue';
    import type {WorkflowRunWithRelations} from '@common/types';
    import {Ban, CheckCircle2, Clock, GitBranch, GitCommitHorizontal, Timer, User, Workflow, XCircle} from '@lucide/vue';
    import {formatDistanceToNow} from 'date-fns';
    import {computed, type Component} from 'vue';

    const props = defineProps<{
        workflows: WorkflowRunWithRelations[];
        isLoading: boolean;
    }>();

    type StatusStyle = {icon: Component; badge: string; chip: string; label: string};

    const statusConfig: Record<string, StatusStyle> = {
        success: {
            icon: CheckCircle2,
            badge: 'bg-green-500/10 text-green-600 border-green-500/20',
            chip: 'bg-green-500/10 text-green-600 dark:text-green-400',
            label: 'Success',
        },
        failure: {
            icon: XCircle,
            badge: 'bg-red-500/10 text-red-600 border-red-500/20',
            chip: 'bg-red-500/10 text-red-600 dark:text-red-400',
            label: 'Failed',
        },
        in_progress: {
            icon: Clock,
            badge: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
            chip: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            label: 'In Progress',
        },
        queued: {
            icon: Clock,
            badge: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
            chip: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
            label: 'Queued',
        },
        cancelled: {
            icon: Ban,
            badge: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
            chip: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
            label: 'Cancelled',
        },
    };

    function getStatusConfig(w: WorkflowRunWithRelations) {
        if (w.status === 'in_progress') return statusConfig.in_progress;
        if (w.status === 'queued') return statusConfig.queued;
        return statusConfig[w.conclusion ?? 'success'] ?? statusConfig.success;
    }

    function workflowDuration(w: WorkflowRunWithRelations) {
        if (!w.runStartedAt || !w.updatedAt) return 'Pending';
        const start = new Date(w.runStartedAt).getTime();
        const end = new Date(w.updatedAt).getTime();
        const seconds = Math.max(0, Math.floor((end - start) / 1000));
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    }

    const rows = computed(() =>
        props.workflows.map((run) => ({
            run,
            status: getStatusConfig(run),
            duration: workflowDuration(run),
            age: run.createdAt ? formatDistanceToNow(new Date(run.createdAt), {addSuffix: true}) : null,
        })),
    );
</script>

<template>
    <Card>
        <CardHeader>
            <CardTitle>Recent Workflow Runs</CardTitle>
            <CardDescription>Latest CI/CD pipeline executions</CardDescription>
        </CardHeader>
        <CardContent>
            <div
                v-if="isLoading"
                class="space-y-4"
            >
                <div
                    v-for="n in 4"
                    :key="n"
                    class="flex gap-3"
                >
                    <Skeleton class="h-9 w-9 shrink-0 rounded-lg" />
                    <div class="min-w-0 flex-1 space-y-2">
                        <Skeleton class="h-4 w-2/5" />
                        <Skeleton class="h-3 w-3/5" />
                        <Skeleton class="h-3 w-1/2" />
                    </div>
                </div>
            </div>
            <div
                v-else-if="workflows.length === 0"
                class="flex flex-col items-center justify-center py-10 text-center"
            >
                <Workflow class="h-9 w-9 text-muted-foreground/40" />
                <p class="mt-2 text-sm text-muted-foreground">No recent workflow runs.</p>
            </div>
            <ul
                v-else
                class="-mx-2 divide-y"
            >
                <li
                    v-for="{run, status, duration, age} in rows"
                    :key="run.id"
                    class="flex gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-accent/50"
                >
                    <span
                        class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                        :class="status.chip"
                    >
                        <component
                            :is="status.icon"
                            class="h-4 w-4"
                        />
                    </span>
                    <div class="min-w-0 flex-1">
                        <div class="flex items-start justify-between gap-3">
                            <p
                                class="line-clamp-1 text-sm font-medium"
                                :title="run.name ?? undefined"
                            >
                                {{ run.name }}
                            </p>
                            <Badge
                                variant="outline"
                                class="shrink-0"
                                :class="status.badge"
                            >
                                {{ status.label }}
                            </Badge>
                        </div>
                        <p class="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span class="truncate">{{ run.repository?.name ?? 'unknown' }}</span>
                            <GitBranch class="h-3 w-3 shrink-0" />
                            <span class="truncate">{{ run.headBranch }}</span>
                        </p>
                        <p
                            v-if="run.headCommitMessage"
                            class="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground"
                            :title="run.headCommitMessage"
                        >
                            <GitCommitHorizontal class="mt-px h-3 w-3 shrink-0" />
                            <span class="line-clamp-1">{{ run.headCommitMessage }}</span>
                        </p>
                        <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span class="flex items-center gap-1">
                                <User class="h-3 w-3" />
                                {{ run.headCommitAuthorName }}
                            </span>
                            <span class="flex items-center gap-1 tabular-nums">
                                <Timer class="h-3 w-3" />
                                {{ duration }}
                            </span>
                            <span
                                v-if="age"
                                class="ml-auto"
                            >
                                {{ age }}
                            </span>
                        </div>
                    </div>
                </li>
            </ul>
        </CardContent>
    </Card>
</template>
