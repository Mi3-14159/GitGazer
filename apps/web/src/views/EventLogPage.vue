<script setup lang="ts">
    import EventLogCard from '@/components/event-log/EventLogCard.vue';
    import EventLogFilters from '@/components/event-log/EventLogFilters.vue';
    import EventLogStatsCards from '@/components/event-log/EventLogStats.vue';
    import PageHeader from '@/components/PageHeader.vue';
    import Button from '@/components/ui/Button.vue';
    import Card from '@/components/ui/Card.vue';
    import CardContent from '@/components/ui/CardContent.vue';
    import CardDescription from '@/components/ui/CardDescription.vue';
    import CardHeader from '@/components/ui/CardHeader.vue';
    import CardTitle from '@/components/ui/CardTitle.vue';
    import EmptyState from '@/components/ui/EmptyState.vue';
    import Skeleton from '@/components/ui/Skeleton.vue';
    import {useEventLog} from '@/composables/useEventLog';
    import type {EventLogCategory, EventLogEntry, EventLogStats, EventLogType} from '@common/types';
    import {Bell, Loader2, ScrollText} from 'lucide-vue-next';
    import {onMounted, ref} from 'vue';

    const PAGE_SIZE = 50;

    const {getEventLogEntries, getEventLogStats, toggleRead, markAllRead, isLoading} = useEventLog();

    const entries = ref<EventLogEntry[]>([]);
    const stats = ref<EventLogStats>({total: 0, unread: 0, read: 0});
    const currentFilters = ref<{type?: EventLogType; category?: EventLogCategory; read?: boolean; search?: string}>({});
    const hasMore = ref(true);
    const isLoadingMore = ref(false);

    async function loadData() {
        const [entriesResult, statsResult] = await Promise.all([getEventLogEntries({...currentFilters.value, limit: PAGE_SIZE}), getEventLogStats()]);
        entries.value = entriesResult ?? [];
        stats.value = statsResult ?? {total: 0, unread: 0, read: 0};
        hasMore.value = (entriesResult?.length ?? 0) >= PAGE_SIZE;
    }

    onMounted(loadData);

    async function handleFilterChange(filter: {type?: EventLogType; category?: EventLogCategory; read?: boolean; search?: string}) {
        currentFilters.value = filter;
        const result = await getEventLogEntries({...filter, limit: PAGE_SIZE});
        entries.value = result ?? [];
        hasMore.value = (result?.length ?? 0) >= PAGE_SIZE;
    }

    async function handleLoadMore() {
        if (isLoadingMore.value || !hasMore.value) return;
        isLoadingMore.value = true;
        try {
            const result = await getEventLogEntries({...currentFilters.value, limit: PAGE_SIZE, offset: entries.value.length});
            const newEntries = result ?? [];
            entries.value = [...entries.value, ...newEntries];
            hasMore.value = newEntries.length >= PAGE_SIZE;
        } finally {
            isLoadingMore.value = false;
        }
    }

    async function handleToggleRead(id: string, read: boolean) {
        const idx = entries.value.findIndex((e) => e.id === id);
        if (idx === -1) return;

        // Optimistic update
        const previousEntry = entries.value[idx];
        const previousStats = {...stats.value};
        entries.value[idx] = {...previousEntry, read};
        stats.value = read
            ? {...stats.value, unread: stats.value.unread - 1, read: stats.value.read + 1}
            : {...stats.value, unread: stats.value.unread + 1, read: stats.value.read - 1};

        try {
            const updated = await toggleRead(id, read);
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
            title="Event Log"
            description="Review and manage all workflow notifications and events"
            :icon="ScrollText"
        />

        <!-- Loading -->
        <div
            v-if="isLoading && entries.length === 0"
            class="space-y-4"
        >
            <div class="grid gap-4 md:grid-cols-3">
                <Skeleton class="h-24 w-full rounded-xl" />
                <Skeleton class="h-24 w-full rounded-xl" />
                <Skeleton class="h-24 w-full rounded-xl" />
            </div>
            <Skeleton class="h-64 w-full rounded-xl" />
        </div>

        <template v-else>
            <!-- Stats -->
            <EventLogStatsCards :stats="stats" />

            <!-- Filters + List -->
            <Card>
                <CardHeader>
                    <CardTitle>Events</CardTitle>
                    <CardDescription> All workflow alerts and notifications in one place </CardDescription>
                </CardHeader>
                <CardContent class="space-y-4">
                    <EventLogFilters
                        :unread-count="stats.unread"
                        @filter-change="handleFilterChange"
                        @mark-all-read="handleMarkAllRead"
                    />

                    <!-- Event List -->
                    <EmptyState
                        v-if="entries.length === 0"
                        :icon="Bell"
                        :message="
                            currentFilters.type || currentFilters.category || currentFilters.read !== undefined || currentFilters.search
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
