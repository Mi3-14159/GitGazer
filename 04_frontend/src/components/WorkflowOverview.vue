<script setup lang="ts">
import {
  Job,
  listJobsResponse,
  onPutJobSubscriptionResponse,
  listJobs,
  onPutJob,
} from '../queries';
import {
  generateClient,
  type GraphQLQuery,
  type GraphQLSubscription,
} from 'aws-amplify/api';
import { fetchAuthSession } from 'aws-amplify/auth';
import { onMounted, onUnmounted, reactive } from 'vue';
import WorkflowCard from './WorkflowCard.vue';

const client = generateClient();
const jobs = reactive(new Map());

const handleListJobs = async () => {
  const session = await fetchAuthSession();

  const groups: string[] =
    (session.tokens?.accessToken.payload['cognito:groups'] as string[]) ?? [];

  groups.forEach(async group => {
    const response = await client.graphql<GraphQLQuery<listJobsResponse>>({
      query: listJobs(group),
    });
    response.data.listJobs.items.forEach((job: Job) => {
      jobs.set(job.workflow_name, job);
    });
  });
};

handleListJobs();

let subscription;

onMounted(() => {
  subscription = client
    .graphql<GraphQLSubscription<onPutJobSubscriptionResponse>>({
      query: onPutJob,
    })
    .subscribe({
      next: ({ data }) => {
        jobs.set(data.onPutJob.workflow_name, data.onPutJob);
      },
      error: (error: any) => console.warn(new Date().toISOString(), error),
    });
});

onUnmounted(() => {
  subscription.unsubscribe();
});
</script>

<template>
  <v-main>
    <v-row align="start" v-for="[key, job] in jobs" :key="key" no-gutters>
      <WorkflowCard :job="job" />
    </v-row>
  </v-main>
</template>

<style scoped></style>
