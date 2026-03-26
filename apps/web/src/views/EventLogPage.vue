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
    import {useEventLog} from '@/composables/useEventLog';
    import {useEventLogFilters} from '@/composables/useEventLogFilters';
    import type {EventLogCategory, EventLogEntry, EventLogStats, EventLogType} from '@common/types';
    import {Bell, CheckCheck, Loader2, ScrollText} from 'lucide-vue-next';
    import {computed, onMounted, ref, watch} from 'vue';

    const PAGE_SIZE = 50;

    const {getEventLogEntries, getEventLogStats, toggleRead, markAllRead, isLoading} = useEventLog();
    const {type, read, category, search} = useEventLogFilters();

    const entries = ref<EventLogEntry[]>([]);
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
        const previousEntry = entries.value[idx];
        const previousStats = {...stats.value};
        entries.value[idx] = {...previousEntry, read: readVal};
        stats.value = readVal
            ? {...stats.value, unread: stats.value.unread - 1, read: stats.value.read + 1}
            : {...stats.value, unread: stats.value.unread + 1, read: stats.value.read - 1};

        try {
            const updated = await toggleRead(id, readVal);
            if (updated) entries.value[idx] = updated;
        } catch {
            // Revert on failure
            entries.value[idx] = previousEntry;
            stats.value = previousStats;
        }
    }

    async function handleMarkAllRead() {
        // Optimistic update
        const previousEntries = entries.value;
        const previousStats = {...stats.value};
        entries.value = entries.value.map((e) => ({...e, read: true}));
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

                    <!-- Event List -->
                    <EmptyState
                        v-if="entries.length === 0"
                        :icon="Bell"
                        :message="
                            hasActiveFilters
                                ? 'No events match your filters. Try adjusting your search or filter.'
                                : 'No events yet. Events will appear as workflows trigger alerts.'
                        "
                    />

                    <div
                        v-else
                        class="space-y-3"
                    >
                        <EventLogCard
                            v-for="entry in entries"
                            :key="entry.id"
                            :entry="entry"
                            @toggle-read="handleToggleRead"
                        />

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
