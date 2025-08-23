<script setup lang="ts">
    import WorkflowCard from '@components/WorkflowCard.vue';
    import WorkflowCardDetails from '@components/WorkflowCardDetails.vue';
    import {GitGazerWorkflowJobEvent, ListJobsQueryVariables} from '@graphql/api';
    import {listJobs} from '@graphql/queries';
    import {onPutJob} from '@graphql/subscriptions';
    import {CONNECTION_STATE_CHANGE, ConnectionState, generateClient, type GraphQLQuery, type GraphQLSubscription} from 'aws-amplify/api';
    import {fetchAuthSession} from 'aws-amplify/auth';
    import {Hub} from 'aws-amplify/utils';
    import {Subscription} from 'rxjs';
    import {computed, onMounted, onUnmounted, reactive, ref} from 'vue';
    import {useDisplay} from 'vuetify';

    const client = generateClient();
    const jobs = reactive(new Map<number, GitGazerWorkflowJobEvent>());
    const {smAndDown} = useDisplay();
    const groupBy = ref<'none' | 'repository' | 'workflow'>('none');
    const selectedJob = ref<GitGazerWorkflowJobEvent | null>(null);

    // Group by options for dropdown
    const groupByOptions = [
        {title: 'None', value: 'none'},
        {title: 'Repository', value: 'repository'},
        {title: 'Workflow', value: 'workflow'},
    ];

    // Table headers for desktop view
    const headers = [
        {title: 'Repository', value: 'repository_full_name', sortable: true},
        {title: 'Workflow', value: 'workflow_name', sortable: true},
        {title: 'Job Name', value: 'job_name', sortable: true},
        {title: 'Status', value: 'status', sortable: true},
        {title: 'Created', value: 'created_at', sortable: true},
    ];

    // Helper functions for table display
    const getJobStatus = (job: GitGazerWorkflowJobEvent) => {
        return job.workflow_job_event.workflow_job.conclusion || job.workflow_job_event.workflow_job.status || 'In Progress';
    };

    const getJobStatusColor = (job: GitGazerWorkflowJobEvent) => {
        const status = getJobStatus(job).toLowerCase();
        switch (status) {
            case 'success':
                return 'success';
            case 'failure':
            case 'failed':
                return 'error';
            case 'cancelled':
                return 'warning';
            case 'in progress':
            case 'in_progress':
            case 'queued':
                return 'info';
            default:
                return 'default';
        }
    };

    const formatJobTime = (job: GitGazerWorkflowJobEvent) => {
        const date = new Date(job.workflow_job_event.workflow_job.created_at);
        return date.toLocaleString();
    };

    const viewJob = (job: GitGazerWorkflowJobEvent) => {
        selectedJob.value = job;
    };

    // Individual jobs sorted by creation time
    const sortedJobs = computed(() => {
        const jobArray = Array.from(jobs.values())
            .map((job) => ({
                ...job,
                repository_full_name: job.workflow_job_event.repository.full_name,
                workflow_name: job.workflow_job_event.workflow_job.workflow_name,
                job_name: job.workflow_job_event.workflow_job.name,
                status: getJobStatus(job),
                created_at: formatJobTime(job),
            }))
            .sort(
                (a, b) =>
                    new Date(b.workflow_job_event.workflow_job.created_at).getTime() -
                    new Date(a.workflow_job_event.workflow_job.created_at).getTime(),
            );

        if (groupBy.value === 'none') {
            return jobArray;
        }

        // Group jobs based on the selected grouping option
        const grouped = new Map<string, any[]>();

        jobArray.forEach((job) => {
            const key = groupBy.value === 'repository' ? job.repository_full_name : job.workflow_name;

            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key)?.push(job);
        });

        // Convert grouped data to flat array with group headers
        const result: any[] = [];
        for (const [groupName, groupJobs] of grouped.entries()) {
            // Add group header
            result.push({
                isGroupHeader: true,
                groupName,
                groupType: groupBy.value,
                jobCount: groupJobs.length,
                job_id: `group-${groupName}`, // Unique key for group headers
            });
            // Add jobs in this group
            result.push(...groupJobs);
        }

        return result;
    });

    // Group jobs by workflow for mobile card view
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
        <!-- Filter Controls -->
        <v-card
            class="mb-4"
            elevation="1"
        >
            <v-card-text>
                <v-row
                    align="center"
                    dense
                >
                    <v-col cols="auto">
                        <span class="text-subtitle-2">Group by:</span>
                    </v-col>
                    <v-col
                        cols="3"
                        sm="2"
                    >
                        <v-select
                            v-model="groupBy"
                            :items="groupByOptions"
                            item-title="title"
                            item-value="value"
                            density="compact"
                            variant="outlined"
                            hide-details
                        ></v-select>
                    </v-col>
                </v-row>
            </v-card-text>
        </v-card>

        <!-- Desktop Table View -->
        <div v-if="!smAndDown">
            <v-data-table
                :headers="headers"
                :items="sortedJobs"
                item-key="job_id"
                class="elevation-1"
                density="compact"
                hide-default-footer
                :items-per-page="-1"
                :sort-by="[{key: 'created_at', order: 'desc'}]"
            >
                <!-- Group Header Row -->
                <template v-slot:item="{item}">
                    <tr
                        v-if="item.isGroupHeader"
                        class="group-header"
                    >
                        <td
                            :colspan="headers.length"
                            class="text-h6 pa-4 bg-grey-lighten-4"
                        >
                            <v-icon
                                :icon="item.groupType === 'repository' ? 'mdi-source-repository' : 'mdi-cog'"
                                class="mr-2"
                            ></v-icon>
                            {{ item.groupName }}
                            <v-chip
                                size="small"
                                class="ml-2"
                                >{{ item.jobCount }} jobs</v-chip
                            >
                        </td>
                    </tr>
                    <tr
                        v-else
                        class="clickable-row"
                        @click="viewJob(item)"
                    >
                        <td>{{ item.repository_full_name }}</td>
                        <td>{{ item.workflow_name }}</td>
                        <td>{{ item.job_name }}</td>
                        <td>
                            <v-chip
                                :color="getJobStatusColor(item)"
                                size="small"
                                variant="flat"
                            >
                                {{ item.status }}
                            </v-chip>
                        </td>
                        <td>{{ item.created_at }}</td>
                    </tr>
                </template>
            </v-data-table>
        </div>

        <!-- Mobile Card View -->
        <div v-else>
            <v-row
                align="start"
                v-for="group in groupedJobs"
                :key="group.run_id"
                no-gutters
            >
                <WorkflowCard
                    :run_id="group.run_id"
                    :repository_full_name="group.repository_full_name"
                    :workflow_name="group.workflow_name"
                    :jobs="group.jobs"
                />
            </v-row>
        </div>

        <!-- Job Details Dialog -->
        <WorkflowCardDetails
            :job="selectedJob"
            @update:job="selectedJob = $event"
        />
    </v-main>
</template>

<style scoped>
    .group-header {
        background-color: #f5f5f5;
        border-bottom: 2px solid #e0e0e0;
    }

    .group-header td {
        font-weight: 600;
        color: #424242;
    }

    .clickable-row {
        cursor: pointer;
        transition: background-color 0.2s ease;
    }

    .clickable-row:hover {
        background-color: rgba(0, 0, 0, 0.08);
    }
</style>
