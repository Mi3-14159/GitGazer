<script setup lang="ts">
    import {CONNECTION_STATE_CHANGE, ConnectionState, generateClient, type GraphQLQuery, type GraphQLSubscription} from 'aws-amplify/api';
    import {fetchAuthSession} from 'aws-amplify/auth';
    import {Hub} from 'aws-amplify/utils';
    import {computed, onMounted, onUnmounted, reactive} from 'vue';
    import {Job, listJobs, listJobsResponse, onPutJob, onPutJobSubscriptionResponse} from '../queries';
    import WorkflowCard from './WorkflowCard.vue';

    const client = generateClient();
    const jobs = reactive(new Map());

    // Group jobs by workflow id (using run_id for this example)
    const groupedJobs = computed(() => {
        const groups = new Map<number, {repository_full_name: string; jobs: Job[]; workflow_name: string}>();

        for (const job of jobs.values()) {
            const key = job.run_id;
            if (!groups.has(key)) groups.set(key, {repository_full_name: job.repository.full_name, jobs: [], workflow_name: job.workflow_name});
            groups.get(key)?.jobs.push(job);
        }

        groups.forEach(({jobs}) => {
            jobs.sort((a, b) => new Date(b.workflow_job.created_at).getTime() - new Date(a.workflow_job.created_at).getTime());
        });

        return Array.from(groups.entries())
            .map(([workflowId, {repository_full_name, jobs, workflow_name}]) => ({workflowId, repository_full_name, jobs, workflow_name}))
            .reverse();
    });

    let subscription;
    let priorConnectionState: ConnectionState;

    const handleListJobs = async () => {
        const session = await fetchAuthSession();
        const groups: string[] = (session.tokens?.accessToken.payload['cognito:groups'] as string[]) ?? [];
        groups.forEach(async (group) => {
            const response = await client.graphql<GraphQLQuery<listJobsResponse>>({
                query: listJobs(group),
            });
            response.data.listJobs.items.forEach((job: Job) => {
                jobs.set(job.job_id, job);
            });
        });
    };

    handleListJobs();

    onMounted(() => {
        subscription = client
            .graphql<GraphQLSubscription<onPutJobSubscriptionResponse>>({
                query: onPutJob,
            })
            .subscribe({
                next: ({data}) => {
                    jobs.set(data.onPutJob.job_id, data.onPutJob);
                },
                error: (error: any) => console.warn(new Date().toISOString(), error),
            });
    });

    Hub.listen('API', (data: any) => {
        const {payload} = data;
        if (payload.event === CONNECTION_STATE_CHANGE) {
            if (priorConnectionState === ConnectionState.Connecting && payload.data.connectionState === ConnectionState.Connected) {
                handleListJobs();
            }
            priorConnectionState = payload.data.connectionState;
        }
    });

    onUnmounted(() => {
        subscription.unsubscribe();
    });
</script>

<template>
    <v-main>
        <template
            v-for="group in groupedJobs"
            :key="group.workflowId"
        >
            <WorkflowCard
                :repository_full_name="group.repository_full_name"
                :workflowId="group.workflowId"
                :jobs="group.jobs"
                :workflow_name="group.workflow_name"
            />
        </template>
    </v-main>
</template>

<style scoped></style>
