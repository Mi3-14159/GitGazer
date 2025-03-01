<script setup lang="ts">
    import {CONNECTION_STATE_CHANGE, ConnectionState, generateClient, type GraphQLQuery, type GraphQLSubscription} from 'aws-amplify/api';
    import {fetchAuthSession} from 'aws-amplify/auth';
    import {Hub} from 'aws-amplify/utils';
    import {computed, onMounted, onUnmounted, reactive} from 'vue';
    import {Job, listJobs, listJobsResponse, onPutJob, onPutJobSubscriptionResponse} from '../queries';
    import WorkflowCard from './WorkflowCard.vue';

    const client = generateClient();
    const jobs = reactive(new Map());

    const reversedJobs = computed(() => Array.from(jobs.entries()).reverse());

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
        <v-row
            align="start"
            v-for="[key, job] in reversedJobs"
            :key="key"
            no-gutters
        >
            <WorkflowCard :job="job" />
        </v-row>
    </v-main>
</template>

<style scoped></style>
