<script setup lang="ts">
import { ref, reactive } from 'vue'
import {
    generateClient,
    type GraphQLQuery,
    type GraphQLResult,
    type GraphQLSubscription,
} from 'aws-amplify/api'
import { getCurrentUser, type AuthUser } from 'aws-amplify/auth'
import AppHeaderUser from './AppHeaderUser.vue'
import WorkflowJob from './WorkflowJob.vue'

import * as queries from '../queries'
import type {
    Job,
    listJobsResponse,
    onPutJobSubscriptionResponse,
} from '@/types'

const user = ref<AuthUser>()
const currentUser = await getCurrentUser()
user.value = currentUser

const client = generateClient()
const jobs = reactive(new Map())

const handleListJobs = async () => {
    try {
        const response = await client.graphql<GraphQLQuery<listJobsResponse>>({
            query: queries.listJobs,
        })
        response.data.listJobs.items.forEach((job: Job) => {
            jobs.set(job.run_id, {
                action: job.action,
                run_id: job.run_id,
                workflow_name: job.workflow_name,
            })
        })
    } catch (error) {
        console.error(error)
    }
}

handleListJobs()

client
    .graphql<
        GraphQLSubscription<onPutJobSubscriptionResponse>
    >({ query: queries.onPutJob })
    .subscribe({
        next: ({ data }) => {
            jobs.set(data.onPutJob.run_id, {
                action: data.onPutJob.action,
                run_id: data.onPutJob.run_id,
                workflow_name: data.onPutJob.workflow_name,
            })
        },
        error: (error: any) => console.warn(new Date().toISOString(), error),
    })
</script>

<template>
    <div class="app">
        <WorkflowJob v-for="[key, job] in jobs" :job="job" />
        <AppHeaderUser
            id="header-user-container"
            v-if="user"
            :userId="user.userId"
            :username="user.username"
        />
    </div>
</template>

<style scoped>
#header-user-container {
    position: fixed;
    top: 10px;
    right: 10px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
}
</style>
