<script setup lang="ts">
    import {useAnalytics} from '@/composables/useAnalytics';
    import {useIntegration} from '@/composables/useIntegration';
    import type {Integration} from '@common/types';
    import {QueryResponse} from '@common/types/analytics';
    import Papa from 'papaparse';
    import {computed, onMounted, ref} from 'vue';

    const {submitQuery, pollUntilComplete, isPolling, isSubmitting} = useAnalytics();
    const {getIntegrations, isLoadingIntegrations} = useIntegration();

    const integrations = ref<Integration[]>([]);
    const selectedIntegrationId = ref<string | null>(null);
    const currentQuery = ref<QueryResponse | null>(null);
    const errorMessage = ref<string | null>(null);
    const resultsData = ref<any[]>([]);
    const resultsHeaders = ref<any[]>([]);
    const defaultQuery = `SELECT
    integrationId,
    created_at,
    id,
    "workflow_event.workflow_run.conclusion"
FROM "zetl_2ae4e415_2c03_41f6_b77a_87def23fc43f"."gitgazer_workflows_default"
WHERE
    event_type = 'workflow_run'
LIMIT 10;`;
    const queryText = ref(defaultQuery);

    const isLoading = computed(() => isSubmitting.value || isPolling.value);

    const statusColor = computed(() => {
        if (!currentQuery.value?.status) return 'grey';
        switch (currentQuery.value.status) {
            case 'SUCCEEDED':
                return 'success';
            case 'FAILED':
            case 'CANCELLED':
                return 'error';
            case 'RUNNING':
                return 'info';
            case 'QUEUED':
            case 'REQUESTED':
                return 'warning';
            default:
                return 'grey';
        }
    });

    const handleSubmitQuery = async () => {
        if (!selectedIntegrationId.value) {
            errorMessage.value = 'Please select an integration first';
            return;
        }

        errorMessage.value = null;
        resultsData.value = [];
        resultsHeaders.value = [];

        try {
            // Submit the query
            const response = await submitQuery(selectedIntegrationId.value, queryText.value);
            currentQuery.value = response;

            // Start polling for results
            await pollUntilComplete(response.queryId, (status: QueryResponse) => {
                currentQuery.value = status;
            });

            // If succeeded, fetch and parse the results
            if (currentQuery.value?.status === 'SUCCEEDED' && currentQuery.value.resultsUrl) {
                await fetchResults(currentQuery.value.resultsUrl);
            }
        } catch (error) {
            errorMessage.value = error instanceof Error ? error.message : 'An error occurred';
        }
    };

    const fetchResults = async (url: string) => {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Failed to fetch results');
            }

            const csvText = await response.text();

            // Parse CSV with papaparse
            const parsed = Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                dynamicTyping: true,
            });

            if (parsed.errors.length > 0) {
                console.error('CSV parsing errors:', parsed.errors);
            }

            if (parsed.data.length === 0) {
                return;
            }

            // Extract headers from parsed data
            const headers = parsed.meta.fields || [];
            resultsHeaders.value = headers.map((header) => ({
                title: header,
                key: header,
                sortable: true,
            }));

            // Data is already parsed as objects
            resultsData.value = parsed.data;
        } catch (error) {
            errorMessage.value = `Failed to parse results: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
    };

    const handleDownloadResults = () => {
        if (currentQuery.value?.resultsUrl) {
            window.open(currentQuery.value.resultsUrl, '_blank');
        }
    };

    const handleClearQuery = () => {
        currentQuery.value = null;
        errorMessage.value = null;
        resultsData.value = [];
        resultsHeaders.value = [];
    };

    onMounted(async () => {
        try {
            integrations.value = await getIntegrations();
            if (integrations.value.length > 0) {
                selectedIntegrationId.value = integrations.value[0].id;
            }
        } catch (error) {
            errorMessage.value = `Failed to load integrations: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
    });
</script>

<template>
    <v-main>
        <v-container fluid>
            <!-- Integration Selection -->
            <v-row>
                <v-col cols="auto">
                    <v-select
                        v-model="selectedIntegrationId"
                        :items="integrations"
                        item-title="label"
                        item-value="id"
                        label="Select Integration"
                        variant="outlined"
                        :loading="isLoadingIntegrations"
                        :disabled="isLoading || isLoadingIntegrations"
                        prepend-inner-icon="mdi-account-cog"
                        density="comfortable"
                    >
                    </v-select>
                </v-col>
            </v-row>

            <!-- Query Editor -->
            <v-row style="margin-top: 0">
                <v-col>
                    <v-card>
                        <v-card-title>SQL Query Editor</v-card-title>
                        <v-card-text class="pb-0">
                            <v-textarea
                                v-model="queryText"
                                label="Enter SQL query"
                                :placeholder="defaultQuery"
                                rows="8"
                                variant="outlined"
                                :disabled="isLoading"
                                auto-grow
                            ></v-textarea>
                        </v-card-text>
                        <v-card-actions class="pt-0">
                            <v-btn
                                color="primary"
                                :loading="isLoading"
                                :disabled="!queryText.trim() || !selectedIntegrationId || isLoading"
                                @click="handleSubmitQuery"
                            >
                                <v-icon
                                    start
                                    icon="mdi-play"
                                ></v-icon>
                                Execute Query
                            </v-btn>
                            <v-btn
                                v-if="currentQuery"
                                variant="text"
                                @click="handleClearQuery"
                                :disabled="isLoading"
                            >
                                Clear
                            </v-btn>
                        </v-card-actions>
                    </v-card>
                </v-col>
            </v-row>

            <!-- Error Message -->
            <v-row v-if="errorMessage">
                <v-col>
                    <v-alert
                        type="error"
                        closable
                        @click:close="errorMessage = null"
                    >
                        {{ errorMessage }}
                    </v-alert>
                </v-col>
            </v-row>

            <!-- Query Info -->
            <v-row v-if="currentQuery">
                <v-col>
                    <v-card>
                        <v-card-text class="d-flex flex-column flex-md-row align-start align-md-center ga-2">
                            <div class="d-flex align-center">
                                <span class="text-body-2 mr-2">Query ID:</span>
                                <span class="text-body-2 text-medium-emphasis">{{ currentQuery.queryId }}</span>
                            </div>
                            <div class="d-flex align-center">
                                <span class="text-body-2 mr-2">Status:</span>
                                <v-chip
                                    :color="statusColor"
                                    size="small"
                                >
                                    {{ currentQuery.status }}
                                </v-chip>
                            </div>
                            <v-spacer class="d-none d-md-flex"></v-spacer>
                            <v-btn
                                v-if="currentQuery.status === 'SUCCEEDED' && currentQuery.resultsUrl"
                                color="primary"
                                variant="text"
                                @click="handleDownloadResults"
                                class="align-self-start align-self-md-center"
                            >
                                <v-icon
                                    start
                                    icon="mdi-download"
                                ></v-icon>
                                Download result
                            </v-btn>
                        </v-card-text>
                    </v-card>
                </v-col>
            </v-row>

            <!-- Results Table -->
            <v-row v-if="resultsData.length > 0">
                <v-col>
                    <v-card>
                        <v-card-title>Query Results ({{ resultsData.length }} rows)</v-card-title>
                        <v-card-text>
                            <v-data-table
                                :headers="resultsHeaders"
                                :items="resultsData"
                                :items-per-page="25"
                                density="compact"
                                class="elevation-1"
                            >
                                <template v-slot:no-data>
                                    <v-alert type="info">No results found</v-alert>
                                </template>
                            </v-data-table>
                        </v-card-text>
                    </v-card>
                </v-col>
            </v-row>
        </v-container>
    </v-main>
</template>
