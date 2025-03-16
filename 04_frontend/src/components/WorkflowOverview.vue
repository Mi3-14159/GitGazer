<script setup lang="ts">
    import WorkflowCard from '@components/WorkflowCard.vue';
    import {GitGazerWorkflowJobEvent, ListJobsQueryVariables} from '@graphql/api';
    import {listJobs} from '@graphql/queries';
    import {onPutJob} from '@graphql/subscriptions';
    import {CONNECTION_STATE_CHANGE, ConnectionState, generateClient, type GraphQLQuery, type GraphQLSubscription} from 'aws-amplify/api';
    import {fetchAuthSession} from 'aws-amplify/auth';
    import {Hub} from 'aws-amplify/utils';
    import {Subscription} from 'rxjs';
    import {computed, onMounted, onUnmounted, reactive} from 'vue';

    const client = generateClient();
    const jobs = reactive(new Map<number, GitGazerWorkflowJobEvent>());

    // Group jobs by workflow id (using run_id for this example)
    const groupedJobs = computed(() => {
        const groups = new Map<number, {repository_full_name: string; jobs: GitGazerWorkflowJobEvent[]; workflow_name: string}>();

        for (const job of jobs.values()) {
            const key = job.workflow_job_event.workflow_job.run_id;
            if (!groups.has(key))
                groups.set(key, {
                    repository_full_name: job.workflow_job_event.repository.full_name,
                    jobs: [],
                    workflow_name: job.workflow_job_event.workflow_job.workflow_name,
                });
            groups.get(key)?.jobs.push(job);
        }

        groups.forEach(({jobs}) => {
            jobs.sort(
                (a, b) =>
                    new Date(b.workflow_job_event.workflow_job.created_at).getTime() -
                    new Date(a.workflow_job_event.workflow_job.created_at).getTime(),
            );
        });

        return Array.from(groups.entries())
            .map(([run_id, {repository_full_name, jobs, workflow_name}]) => ({run_id, repository_full_name, jobs, workflow_name}))
            .reverse();
    });

    let subscription: Subscription;
    let priorConnectionState: ConnectionState;

    type listJobsResponse = {
        listJobs: {
            items: GitGazerWorkflowJobEvent[];
        };
    };

    const handleListJobs = async () => {
        const session = await fetchAuthSession();
        const groups: string[] = (session.tokens?.accessToken.payload['cognito:groups'] as string[]) ?? [];
        groups.forEach(async (group) => {
            const variables: ListJobsQueryVariables = {filter: {integrationId: group}};
            const response = await client.graphql<GraphQLQuery<listJobsResponse>>({
                query: listJobs,
                variables,
            });

            response?.data?.listJobs?.items?.forEach((job: GitGazerWorkflowJobEvent) => {
                jobs.set(job.job_id, job);
            });
        });
    };

    handleListJobs();

    type onPutJobSubscriptionResponse = {
        onPutJob: GitGazerWorkflowJobEvent;
    };

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
            :key="group.run_id"
        >
            <WorkflowCard
                :run_id="group.run_id"
                :repository_full_name="group.repository_full_name"
                :workflow_name="group.workflow_name"
                :jobs="group.jobs"
            />
        </template>
    </v-main>
</template>

<style scoped></style>
