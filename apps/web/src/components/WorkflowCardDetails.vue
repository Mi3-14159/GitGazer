<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Dialog from '@/components/ui/Dialog.vue';
    import DialogFooter from '@/components/ui/DialogFooter.vue';
    import DialogHeader from '@/components/ui/DialogHeader.vue';
    import DialogTitle from '@/components/ui/DialogTitle.vue';
    import Label from '@/components/ui/Label.vue';
    import {WorkflowJob, WorkflowRunWithRelations} from '@common/types';
    import {ExternalLink} from 'lucide-vue-next';
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

    const getJobStatus = (job: WorkflowJob) => job.conclusion || job.status || 'In Progress';
    const formatJobTime = (job: WorkflowJob) => new Date(job.createdAt).toLocaleString();
    const getGitHubWebUrl = (job: WorkflowJob, run?: WorkflowRunWithRelations | null) => {
        if (!run) return '';
        return `https://github.com/${run.repository.owner?.login}/${run.repository.name}/actions/runs/${job.runId}`;
    };
</script>

<template>
    <Dialog
        :open="isOpen"
        @update:open="isOpen = $event"
        class="max-w-2xl"
    >
        <template #default="{close}">
            <DialogHeader>
                <DialogTitle>Job Details</DialogTitle>
            </DialogHeader>

            <div
                v-if="props.job"
                class="grid grid-cols-2 gap-4 py-4"
            >
                <div class="space-y-1">
                    <Label class="text-xs text-muted-foreground">Repository</Label>
                    <p class="text-sm font-mono">{{ props.run?.repository.name }}</p>
                </div>
                <div class="space-y-1">
                    <Label class="text-xs text-muted-foreground">Workflow</Label>
                    <p class="text-sm">{{ props.job.workflowName }}</p>
                </div>
                <div class="space-y-1">
                    <Label class="text-xs text-muted-foreground">Job Name</Label>
                    <p class="text-sm">{{ props.job.name }}</p>
                </div>
                <div class="space-y-1">
                    <Label class="text-xs text-muted-foreground">Status</Label>
                    <p class="text-sm">{{ getJobStatus(props.job) }}</p>
                </div>
                <div class="space-y-1">
                    <Label class="text-xs text-muted-foreground">Created At</Label>
                    <p class="text-sm">{{ formatJobTime(props.job) }}</p>
                </div>
                <div class="space-y-1">
                    <Label class="text-xs text-muted-foreground">Run ID</Label>
                    <p class="text-sm font-mono">{{ props.job.runId }}</p>
                </div>
                <div class="space-y-1">
                    <Label class="text-xs text-muted-foreground">Job ID</Label>
                    <p class="text-sm font-mono">{{ props.job.id }}</p>
                </div>
                <div class="space-y-1">
                    <Label class="text-xs text-muted-foreground">Head Branch</Label>
                    <p class="text-sm font-mono">{{ props.job.headBranch }}</p>
                </div>
                <div
                    v-if="getGitHubWebUrl(props.job, props.run)"
                    class="col-span-2"
                >
                    <a
                        :href="getGitHubWebUrl(props.job, props.run)"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                        Open on GitHub <ExternalLink class="h-3 w-3" />
                    </a>
                </div>
            </div>

            <DialogFooter>
                <Button
                    variant="outline"
                    @click="close"
                    >Close</Button
                >
            </DialogFooter>
        </template>
    </Dialog>
</template>
