<script setup lang="ts">
import type {
  Job,
  listJobsResponse,
  onPutJobSubscriptionResponse,
} from '../types';
import {
  generateClient,
  type GraphQLQuery,
  type GraphQLSubscription,
} from 'aws-amplify/api';
import * as queries from '../queries';
import { reactive } from 'vue';
import WorkflowCard from './WorkflowCard.vue';

const client = generateClient();
const jobs = reactive(new Map());

const handleListJobs = async () => {
  try {
    const response = await client.graphql<GraphQLQuery<listJobsResponse>>({
      query: queries.listJobs,
    });
    response.data.listJobs.items.forEach((job: Job) => {
      jobs.set(job.workflow_name, job);
    });
  } catch (error) {
    console.error(error);
  }
};

handleListJobs();

client
  .graphql<GraphQLSubscription<onPutJobSubscriptionResponse>>({
    query: queries.onPutJob,
  })
  .subscribe({
    next: ({ data }) => {
      jobs.set(data.onPutJob.workflow_name, data.onPutJob);
    },
    error: (error: any) => console.warn(new Date().toISOString(), error),
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
