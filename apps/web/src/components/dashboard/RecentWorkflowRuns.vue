<script setup lang="ts">
    import Badge from '@/components/ui/Badge.vue';
    import Card from '@/components/ui/Card.vue';
    import CardContent from '@/components/ui/CardContent.vue';
    import CardDescription from '@/components/ui/CardDescription.vue';
    import CardHeader from '@/components/ui/CardHeader.vue';
    import CardTitle from '@/components/ui/CardTitle.vue';
    import type {WorkflowRunWithRelations} from '@common/types';
    import {formatDistanceToNow} from 'date-fns';
    import {Ban, CheckCircle2, Clock, XCircle} from 'lucide-vue-next';

    defineProps<{
        workflows: WorkflowRunWithRelations[];
        isLoading: boolean;
    }>();

    const statusConfig: Record<string, {icon: any; color: string; label: string}> = {
        success: {icon: CheckCircle2, color: 'bg-green-500/10 text-green-600 border-green-500/20', label: 'Success'},
        failure: {icon: XCircle, color: 'bg-red-500/10 text-red-600 border-red-500/20', label: 'Failed'},
        in_progress: {icon: Clock, color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', label: 'In Progress'},
        queued: {icon: Clock, color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20', label: 'Queued'},
        cancelled: {icon: Ban, color: 'bg-gray-500/10 text-gray-600 border-gray-500/20', label: 'Cancelled'},
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
        const seconds = Math.floor((end - start) / 1000);
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    }
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
                class="text-sm text-muted-foreground text-center py-8"
            >
                Loading workflows...
            </div>
            <div
                v-else-if="workflows.length === 0"
                class="text-sm text-muted-foreground text-center py-8"
            >
                No recent workflow runs.
            </div>
            <div
                v-else
                class="grid gap-4 md:grid-cols-2 min-w-0"
            >
                <Card
                    v-for="w in workflows"
                    :key="w.id"
                    class="hover:shadow-md transition-shadow min-w-0 overflow-hidden"
                >
                    <CardHeader class="pb-3">
                        <div class="flex items-start justify-between">
                            <div class="flex-1">
                                <CardTitle class="text-base mb-1">{{ w.name }}</CardTitle>
                                <div class="text-sm text-muted-foreground">{{ w.repository?.name ?? 'unknown' }} &bull; {{ w.headBranch }}</div>
                            </div>
                            <Badge
                                variant="outline"
                                :class="getStatusConfig(w).color"
                            >
                                <component
                                    :is="getStatusConfig(w).icon"
                                    class="mr-1 h-3 w-3"
                                />
                                {{ getStatusConfig(w).label }}
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div class="space-y-2">
                            <div class="flex items-center gap-2 text-sm">
                                <span class="text-muted-foreground truncate">{{ w.headCommitMessage }}</span>
                            </div>
                            <div class="flex items-center justify-between text-sm text-muted-foreground">
                                <span>{{ w.headCommitAuthorName }}</span>
                                <span>{{ workflowDuration(w) }}</span>
                            </div>
                            <div class="text-xs text-muted-foreground">
                                {{ w.createdAt ? formatDistanceToNow(new Date(w.createdAt), {addSuffix: true}) : '' }}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </CardContent>
    </Card>
</template>
