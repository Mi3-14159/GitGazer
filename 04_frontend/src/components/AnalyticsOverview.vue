<script setup lang="ts">
    import {useAnalytics} from '@/composables/useAnalytics';
    import {QueryResponse} from '@common/types/analytics';
    import Papa from 'papaparse';
    import {computed, ref} from 'vue';

    const {submitQuery, pollUntilComplete, isPolling, isSubmitting} = useAnalytics();

    const defaultQuery = `SELECT integrationId, * FROM "zetl_2ae4e415_2c03_41f6_b77a_87def23fc43f"."gitgazer_workflows_default" limit 10;`;
    const queryText = ref(defaultQuery);
    const currentQuery = ref<QueryResponse | null>(null);
    const errorMessage = ref<string | null>(null);
    const resultsData = ref<any[]>([]);
    const resultsHeaders = ref<any[]>([]);

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
        errorMessage.value = null;
        resultsData.value = [];
        resultsHeaders.value = [];

        try {
            // Submit the query
            const response = await submitQuery(queryText.value);
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
</script>

<template>
    <v-main>
        <v-container fluid>
            <v-row>
                <v-col cols="12">
                    <h1 class="text-h4 mb-4">Analytics Query</h1>
                </v-col>
            </v-row>

            <!-- Query Editor -->
            <v-row>
                <v-col cols="12">
                    <v-card>
                        <v-card-title>SQL Query Editor</v-card-title>
                        <v-card-text>
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
                        <v-card-actions>
                            <v-btn
                                color="primary"
                                :loading="isLoading"
                                :disabled="!queryText.trim() || isLoading"
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
                            <v-spacer></v-spacer>
                            <v-chip
                                v-if="currentQuery?.status"
                                :color="statusColor"
                                variant="flat"
                            >
                                {{ currentQuery.status }}
                            </v-chip>
                        </v-card-actions>
                    </v-card>
                </v-col>
            </v-row>

            <!-- Error Message -->
            <v-row v-if="errorMessage">
                <v-col cols="12">
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
                <v-col cols="12">
                    <v-card>
                        <v-card-title>Query Information</v-card-title>
                        <v-card-text>
                            <v-list density="compact">
                                <v-list-item>
                                    <v-list-item-title>Query ID</v-list-item-title>
                                    <v-list-item-subtitle>{{ currentQuery.queryId }}</v-list-item-subtitle>
                                </v-list-item>
                                <v-list-item>
                                    <v-list-item-title>Status</v-list-item-title>
                                    <v-list-item-subtitle>
                                        <v-chip
                                            :color="statusColor"
                                            size="small"
                                        >
                                            {{ currentQuery.status }}
                                        </v-chip>
                                    </v-list-item-subtitle>
                                </v-list-item>
                            </v-list>
                        </v-card-text>
                        <v-card-actions v-if="currentQuery.status === 'SUCCEEDED' && currentQuery.resultsUrl">
                            <v-btn
                                color="primary"
                                variant="text"
                                @click="handleDownloadResults"
                            >
                                <v-icon
                                    start
                                    icon="mdi-download"
                                ></v-icon>
                                Download CSV
                            </v-btn>
                        </v-card-actions>
                    </v-card>
                </v-col>
            </v-row>

            <!-- Results Table -->
            <v-row v-if="resultsData.length > 0">
                <v-col cols="12">
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
