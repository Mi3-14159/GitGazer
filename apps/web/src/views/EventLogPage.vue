<script setup lang="ts">
    import EventLogCard from '@/components/event-log/EventLogCard.vue';
    import EventLogFilters from '@/components/event-log/EventLogFilters.vue';
    import EventLogStatsCards from '@/components/event-log/EventLogStats.vue';
    import PageHeader from '@/components/PageHeader.vue';
    import Button from '@/components/ui/Button.vue';
    import Card from '@/components/ui/Card.vue';
    import CardContent from '@/components/ui/CardContent.vue';
    import EmptyState from '@/components/ui/EmptyState.vue';
    import Skeleton from '@/components/ui/Skeleton.vue';
    import {useAuth} from '@/composables/useAuth';
    import {enumFilter, stringFilter, useUrlFilters} from '@/composables/useUrlFilters';
    import {isArrayOf, parseApiResponse} from '@/utils/apiResponse';
    import type {EventLogCategory, EventLogEntryRow, EventLogReadFilter, EventLogStats, EventLogType} from '@common/types';
    import {EVENT_LOG_CATEGORIES, EVENT_LOG_READ_VALUES, EVENT_LOG_TYPES, isEventLogEntry, isEventLogStats} from '@common/types';
    import {Bell, CheckCheck, Loader2, ScrollText} from 'lucide-vue-next';
    import {computed, onMounted, ref, watch} from 'vue';

    const PAGE_SIZE = 50;
    const API_ENDPOINT = import.meta.env.VITE_REST_API_ENDPOINT;

    const {fetchWithAuth} = useAuth();
    const loadingCount = ref(0);
    const isLoading = computed(() => loadingCount.value > 0);

    async function getEventLogEntries(filters?: {
        type?: EventLogType;
        category?: EventLogCategory;
        read?: boolean;
        search?: string;
        limit?: number;
        offset?: number;
    }) {
        loadingCount.value++;
        try {
            const params = new URLSearchParams();
            // loop over the params
            Object.entries(filters ?? {}).forEach(([key, value]) => {
                if (value !== undefined) {
                    params.set(key, String(value));
                }
            });

            const qs = params.toString();
            const url = `${API_ENDPOINT}/event-log${qs ? `?${qs}` : ''}`;
            const response = await fetchWithAuth(url);

            if (!response.ok) {
                throw new Error(`Failed to fetch event log: ${response.status}`);
            }

            return parseApiResponse<EventLogEntryRow[]>(response, isArrayOf(isEventLogEntry));
        } finally {
            loadingCount.value--;
        }
    }

    async function getEventLogStats() {
        loadingCount.value++;
        try {
            const response = await fetchWithAuth(`${API_ENDPOINT}/event-log/stats`);
            if (!response.ok) {
                throw new Error(`Failed to fetch event log stats: ${response.status}`);
            }
            return parseApiResponse<EventLogStats>(response, isEventLogStats);
        } finally {
            loadingCount.value--;
        }
    }

    async function toggleRead(id: string, readVal: boolean) {
        const response = await fetchWithAuth(`${API_ENDPOINT}/event-log/${id}/read`, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({read: readVal}),
        });
        if (!response.ok) {
            throw new Error(`Failed to update event log entry: ${response.status}`);
        }
        return parseApiResponse<EventLogEntryRow>(response, isEventLogEntry);
    }

    async function markAllRead() {
        const response = await fetchWithAuth(`${API_ENDPOINT}/event-log/mark-all-read`, {
            method: 'POST',
        });
        if (!response.ok) {
            throw new Error(`Failed to mark all as read: ${response.status}`);
        }
        return parseApiResponse<{updated: number}>(response);
    }
    const {type, read, category, search} = useUrlFilters({
        type: enumFilter<EventLogType | 'all'>('type', ['all', ...EVENT_LOG_TYPES], 'all'),
        read: enumFilter<EventLogReadFilter>('read', EVENT_LOG_READ_VALUES, 'unread'),
        category: enumFilter<EventLogCategory | 'all'>('category', ['all', ...EVENT_LOG_CATEGORIES], 'all'),
        search: stringFilter('search'),
    });

    const entries = ref<EventLogEntryRow[]>([]);
    const stats = ref<EventLogStats>({total: 0, unread: 0, read: 0});
    const hasMore = ref(true);
    const isLoadingMore = ref(false);

    const apiFilters = computed(() => {
        const filters: {type?: EventLogType; category?: EventLogCategory; read?: boolean; search?: string} = {};
        if (type.value !== 'all') filters.type = type.value;
        if (read.value === 'unread') filters.read = false;
        else if (read.value === 'read') filters.read = true;
        if (category.value !== 'all') filters.category = category.value;
        if (search.value.trim()) filters.search = search.value.trim();
        return filters;
    });

    const hasActiveFilters = computed(() => type.value !== 'all' || read.value !== 'all' || category.value !== 'all' || search.value.trim() !== '');

    async function loadEntries() {
        const result = await getEventLogEntries({...apiFilters.value, limit: PAGE_SIZE});
        entries.value = result ?? [];
        hasMore.value = (result?.length ?? 0) >= PAGE_SIZE;
    }

    async function loadData() {
        const [, statsResult] = await Promise.all([loadEntries(), getEventLogStats()]);
        stats.value = statsResult ?? {total: 0, unread: 0, read: 0};
    }

    onMounted(loadData);

    // Debounce search, react instantly to dropdown changes
    let searchDebounce: ReturnType<typeof globalThis.setTimeout>;
    watch(search, () => {
        clearTimeout(searchDebounce);
        searchDebounce = globalThis.setTimeout(loadEntries, 300);
    });
    watch([type, read, category], loadEntries);

    async function handleLoadMore() {
        if (isLoadingMore.value || !hasMore.value) return;
        isLoadingMore.value = true;
        try {
            const result = await getEventLogEntries({...apiFilters.value, limit: PAGE_SIZE, offset: entries.value.length});
            const newEntries = result ?? [];
            entries.value = [...entries.value, ...newEntries];
            hasMore.value = newEntries.length >= PAGE_SIZE;
        } finally {
            isLoadingMore.value = false;
        }
    }

    async function handleToggleRead(id: string, readVal: boolean) {
        const idx = entries.value.findIndex((e) => e.id === id);
        if (idx === -1) return;

        // Optimistic update
        const previousEntries = [...entries.value];
        const previousStats = {...stats.value};

        const shouldRemove = (readVal && read.value === 'unread') || (!readVal && read.value === 'read');
        if (shouldRemove) {
            entries.value = entries.value.filter((e) => e.id !== id);
        } else {
            entries.value[idx] = {...entries.value[idx], read: readVal};
        }
        stats.value = readVal
            ? {...stats.value, unread: stats.value.unread - 1, read: stats.value.read + 1}
            : {...stats.value, unread: stats.value.unread + 1, read: stats.value.read - 1};

        try {
            await toggleRead(id, readVal);
        } catch {
            // Revert on failure
            entries.value = previousEntries;
            stats.value = previousStats;
        }
    }

    async function handleMarkAllRead() {
        // Optimistic update
        const previousEntries = entries.value;
        const previousStats = {...stats.value};
        if (read.value === 'unread') {
            entries.value = [];
        } else {
            entries.value = entries.value.map((e) => ({...e, read: true}));
        }
        stats.value = {...stats.value, unread: 0, read: stats.value.total};

        try {
            await markAllRead();
        } catch {
            // Revert on failure
            entries.value = previousEntries;
            stats.value = previousStats;
        }
    }
</script>

<template>
    <div class="space-y-4 p-4">
        <PageHeader
            description="Review and manage all workflow notifications and events"
            :icon="ScrollText"
        >
            <EventLogStatsCards
                v-if="!isLoading || entries.length > 0"
                :stats="stats"
            />
        </PageHeader>

        <!-- Loading -->
        <div
            v-if="isLoading && entries.length === 0"
            class="space-y-4"
        >
            <div class="space-y-4">
                <Skeleton class="h-10 w-full rounded-xl" />
                <Skeleton class="h-64 w-full rounded-xl" />
            </div>
        </div>

        <template v-else>
            <!-- Filters + List -->
            <Card>
                <CardContent class="pt-4 space-y-4">
                    <EventLogFilters
                        v-model:type="type"
                        v-model:read="read"
                        v-model:category="category"
                        v-model:search="search"
                    >
                        <Button
                            variant="outline"
                            size="sm"
                            :disabled="stats.unread === 0"
                            @click="handleMarkAllRead"
                        >
                            <CheckCheck class="h-4 w-4 mr-2" />
                            Mark All Read
                        </Button>
                    </EventLogFilters>

                    <!-- Loading overlay for filter changes -->
                    <Transition name="fade">
                        <div
                            v-if="isLoading && entries.length > 0"
                            class="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground"
                        >
                            <Loader2 class="h-4 w-4 animate-spin" />
                            <span>Updating...</span>
                        </div>
                    </Transition>

                    <!-- Event List -->
                    <EmptyState
                        v-if="entries.length === 0 && !isLoading"
                        :icon="Bell"
                        :message="
                            hasActiveFilters
                                ? 'No events match your filters. Try adjusting your search or filter.'
                                : 'No events yet. Events will appear as workflows trigger alerts.'
                        "
                    />

                    <div
                        v-else
                        :class="{'opacity-50 pointer-events-none transition-opacity duration-200': isLoading}"
                    >
                        <TransitionGroup
                            name="event-list"
                            tag="div"
                            class="space-y-3"
                        >
                            <EventLogCard
                                v-for="entry in entries"
                                :key="entry.id"
                                :entry="entry"
                                @toggle-read="handleToggleRead"
                            />
                        </TransitionGroup>

                        <div
                            v-if="hasMore"
                            class="flex justify-center pt-2"
                        >
                            <Button
                                variant="outline"
                                :disabled="isLoadingMore"
                                @click="handleLoadMore"
                            >
                                <Loader2
                                    v-if="isLoadingMore"
                                    class="h-4 w-4 mr-2 animate-spin"
                                />
                                Load More
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </template>
    </div>
</template>

<style scoped>
    .event-list-leave-active {
        transition: all 0.3s ease;
    }

    .event-list-leave-to {
        opacity: 0;
        transform: translateX(30px);
    }

    .event-list-move {
        transition: transform 0.3s ease;
    }

    .fade-enter-active,
    .fade-leave-active {
        transition: opacity 0.2s ease;
    }

    .fade-enter-from,
    .fade-leave-to {
        opacity: 0;
    }
</style>
