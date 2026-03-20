<script setup lang="ts">
    import Badge from '@/components/ui/Badge.vue';
    import Button from '@/components/ui/Button.vue';
    import Dialog from '@/components/ui/Dialog.vue';
    import DialogDescription from '@/components/ui/DialogDescription.vue';
    import DialogFooter from '@/components/ui/DialogFooter.vue';
    import DialogHeader from '@/components/ui/DialogHeader.vue';
    import DialogTitle from '@/components/ui/DialogTitle.vue';
    import Separator from '@/components/ui/Separator.vue';
    import {formatDuration, statusBadgeVariant, statusIcon} from '@/utils/status';
    import {WorkflowJob, WorkflowRunWithRelations} from '@common/types';
    import {formatDistanceToNow} from 'date-fns';
    import {ExternalLink, GitBranch, GitCommit, Server, User} from 'lucide-vue-next';
    import {computed} from 'vue';

    const props = defineProps<{
        job: WorkflowJob | null;
        run: WorkflowRunWithRelations | undefined;
    }>();

    const emit = defineEmits<{(e: 'update:job', value: WorkflowJob | null): void}>();

    const isOpen = computed({
        get: () => Boolean(props.job),
        set: (val: boolean) => {
            if (!val) emit('update:job', null);
        },
    });

    const jobStatus = computed(() => {
        if (!props.job) return '';
        return props.job.conclusion || props.job.status || 'in_progress';
    });

    const jobDuration = computed(() => {
        if (!props.job) return '-';
        return formatDuration(props.job.startedAt, props.job.completedAt);
    });

    const jobStartedAgo = computed(() => {
        if (!props.job?.startedAt) return '-';
        return formatDistanceToNow(new Date(props.job.startedAt), {addSuffix: true});
    });

    const StatusIconComponent = computed(() => statusIcon(jobStatus.value));

    const getGitHubWebUrl = (job: WorkflowJob, run?: WorkflowRunWithRelations | null) => {
        if (!run?.repository) return '';
        return `https://github.com/${run.repository.owner?.login}/${run.repository.name}/actions/runs/${job.runId}`;
    };

    function openOnGitHub() {
        if (!props.job) return;
        const url = getGitHubWebUrl(props.job, props.run);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
    }
</script>

<template>
    <Dialog
        :open="isOpen"
        @update:open="isOpen = $event"
        class="max-w-2xl"
    >
        <template #default="{close}">
            <DialogHeader>
                <DialogTitle class="flex items-center gap-2">
                    <Server class="h-5 w-5 text-muted-foreground" />
                    {{ props.job?.name }}
                </DialogTitle>
                <DialogDescription> Job details from workflow run #{{ props.job?.runAttempt }} </DialogDescription>
            </DialogHeader>

            <div
                v-if="props.job"
                class="space-y-6 pt-2"
            >
                <!-- Job Status Overview -->
                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-2">
                        <div class="text-sm font-medium text-muted-foreground">Status</div>
                        <Badge
                            :variant="statusBadgeVariant(jobStatus)"
                            class="gap-1"
                        >
                            <component
                                :is="StatusIconComponent"
                                class="h-3.5 w-3.5"
                            />
                            {{ jobStatus === 'in_progress' ? 'running' : jobStatus }}
                        </Badge>
                    </div>
                    <div class="space-y-2">
                        <div class="text-sm font-medium text-muted-foreground">Duration</div>
                        <div class="text-sm font-mono">{{ jobDuration }}</div>
                    </div>
                    <div class="space-y-2">
                        <div class="text-sm font-medium text-muted-foreground">Runner</div>
                        <div class="text-sm font-mono">{{ props.job.runnerGroupName || 'N/A' }}</div>
                    </div>
                    <div class="space-y-2">
                        <div class="text-sm font-medium text-muted-foreground">Started</div>
                        <div class="text-sm">{{ jobStartedAgo }}</div>
                    </div>
                </div>

                <!-- Workflow Context -->
                <Separator />
                <div>
                    <div class="text-sm font-medium mb-3">Workflow Context</div>
                    <div class="grid grid-cols-2 gap-3 text-sm">
                        <div class="space-y-1">
                            <div class="text-muted-foreground">Repository</div>
                            <div class="font-mono">{{ props.run?.repository?.name }}</div>
                        </div>
                        <div class="space-y-1">
                            <div class="text-muted-foreground">Branch</div>
                            <div class="flex items-center gap-1">
                                <GitBranch class="h-3 w-3" />
                                <span>{{ props.job.headBranch }}</span>
                            </div>
                        </div>
                        <div class="space-y-1">
                            <div class="text-muted-foreground">Workflow</div>
                            <div>{{ props.job.workflowName }}</div>
                        </div>
                        <div class="space-y-1">
                            <div class="text-muted-foreground">Actor</div>
                            <div class="flex items-center gap-1">
                                <User class="h-3 w-3" />
                                <span>{{ props.run?.headCommitAuthorName }}</span>
                            </div>
                        </div>
                        <div class="space-y-1 col-span-2">
                            <div class="text-muted-foreground">Commit</div>
                            <div class="flex items-center gap-1 font-mono text-xs">
                                <GitCommit class="h-3 w-3" />
                                <span>{{ props.run?.headCommitMessage }}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Actions -->
                <Separator />
                <DialogFooter>
                    <Button
                        variant="outline"
                        @click="close"
                    >
                        Close
                    </Button>
                    <Button
                        v-if="getGitHubWebUrl(props.job, props.run)"
                        @click="openOnGitHub"
                        class="gap-2"
                    >
                        <ExternalLink class="h-4 w-4" />
                        View on GitHub
                    </Button>
                </DialogFooter>
            </div>
        </template>
    </Dialog>
</template>
