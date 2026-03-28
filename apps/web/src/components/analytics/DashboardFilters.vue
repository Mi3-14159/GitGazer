<script setup lang="ts">
    import FilterDropdown from '@/components/ui/FilterDropdown.vue';
    import Switch from '@/components/ui/Switch.vue';
    import {FILTER_INJECTION_KEY} from '@/composables/useFilterRoot';
    import {useMetrics} from '@/composables/useMetric';
    import type {GroupByOption} from '@common/types';
    import {ChevronDown, GitBranch, GitFork, Layers, SlidersHorizontal, Tag, User} from 'lucide-vue-next';
    import {computed, onMounted, provide, ref} from 'vue';

    const selectedRepositoryIds = defineModel<number[]>('repositoryIds', {default: () => []});
    const selectedTopics = defineModel<string[]>('topics', {default: () => []});
    const defaultBranchOnly = defineModel<boolean>('defaultBranchOnly', {default: false});
    const usersOnly = defineModel<boolean>('usersOnly', {default: false});
    const groupBy = defineModel<GroupByOption>('groupBy', {default: 'none'});

    const groupByOptions: {label: string; value: GroupByOption}[] = [
        {label: 'No grouping', value: 'none'},
        {label: 'Group by Repository', value: 'repository'},
        {label: 'Group by Topic', value: 'topic'},
    ];

    const groupByRef = computed({
        get: () => groupBy.value as string,
        set: (v: string) => {
            groupBy.value = v as GroupByOption;
        },
    });

    const {fetchRepositories, fetchTopics} = useMetrics();

    const repositories = ref<{id: number; name: string}[]>([]);
    const availableTopics = ref<string[]>([]);

    onMounted(async () => {
        try {
            const [repos, topics] = await Promise.all([fetchRepositories(), fetchTopics()]);
            repositories.value = repos;
            availableTopics.value = topics;
        } catch {
            // silently fail — lists stay empty
        }
    });

    const repoOptions = computed(() => repositories.value.map((r) => ({value: String(r.id), label: r.name})));
    const topicOptions = computed(() => availableTopics.value.map((t) => ({value: t, label: t})));

    // Writable computed ref that bridges v-model number[] ↔ FilterDropdown string[]
    const repoStringsRef = computed({
        get: () => selectedRepositoryIds.value.map(String),
        set: (v: string[]) => {
            selectedRepositoryIds.value = v.map(Number);
        },
    });

    provide(FILTER_INJECTION_KEY, {repositoryIds: repoStringsRef, topics: selectedTopics, groupBy: groupByRef});

    const filtersOpen = ref(false);

    const activeFilterCount = computed(() => {
        let count = 0;
        if (selectedRepositoryIds.value.length) count++;
        if (selectedTopics.value.length) count++;
        if (groupBy.value !== 'none') count++;
        if (defaultBranchOnly.value) count++;
        if (usersOnly.value) count++;
        return count;
    });
</script>

<template>
    <div>
        <!-- Mobile toggle button -->
        <button
            type="button"
            class="sm:hidden flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"
            @click="filtersOpen = !filtersOpen"
        >
            <span class="flex items-center gap-2 text-muted-foreground">
                <SlidersHorizontal class="h-4 w-4" />
                Filters
                <span
                    v-if="activeFilterCount"
                    class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground"
                >
                    {{ activeFilterCount }}
                </span>
            </span>
            <ChevronDown
                class="h-4 w-4 text-muted-foreground transition-transform duration-200"
                :class="{'rotate-180': filtersOpen}"
            />
        </button>

        <!-- Filter content: hidden on mobile unless expanded, always visible on sm+ -->
        <div
            :class="[filtersOpen ? 'flex' : 'hidden', 'sm:flex']"
            class="flex-wrap items-center gap-x-3 gap-y-2 mt-2 sm:mt-0"
        >
            <!-- Repositories -->
            <FilterDropdown
                filter-key="repositoryIds"
                :options="repoOptions"
                :icon="GitFork"
                multiple
                placeholder="Repositories"
                search-placeholder="Search repositories..."
                label="Repositories"
            />

            <!-- Topics -->
            <FilterDropdown
                filter-key="topics"
                :options="topicOptions"
                :icon="Tag"
                multiple
                placeholder="Topics"
                search-placeholder="Search topics..."
                label="Topics"
            />

            <!-- Group By -->
            <FilterDropdown
                filter-key="groupBy"
                :options="groupByOptions"
                :icon="Layers"
                label="Group By"
            />

            <div class="hidden sm:block h-5 w-px bg-border" />

            <!-- Default Branch Only -->
            <label class="flex items-center gap-1.5 cursor-pointer">
                <Switch v-model="defaultBranchOnly" />
                <GitBranch class="h-3.5 w-3.5 text-muted-foreground" />
                <span class="text-sm text-muted-foreground whitespace-nowrap">Default branch only</span>
            </label>

            <!-- Users Only -->
            <label class="flex items-center gap-1.5 cursor-pointer">
                <Switch v-model="usersOnly" />
                <User class="h-3.5 w-3.5 text-muted-foreground" />
                <span class="text-sm text-muted-foreground whitespace-nowrap">Users only</span>
            </label>
        </div>
    </div>
</template>
