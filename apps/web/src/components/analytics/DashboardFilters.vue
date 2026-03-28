<script setup lang="ts">
    import GroupByFilter from '@/components/filters/GroupByFilter.vue';
    import RepositoryFilter from '@/components/filters/RepositoryFilter.vue';
    import TopicFilter from '@/components/filters/TopicFilter.vue';
    import Switch from '@/components/ui/Switch.vue';
    import type {GroupByOption} from '@common/types';
    import {ChevronDown, GitBranch, SlidersHorizontal, User} from 'lucide-vue-next';
    import {computed, ref} from 'vue';

    const selectedRepositoryIds = defineModel<number[]>('repositoryIds', {default: () => []});
    const selectedTopics = defineModel<string[]>('topics', {default: () => []});
    const defaultBranchOnly = defineModel<boolean>('defaultBranchOnly', {default: false});
    const usersOnly = defineModel<boolean>('usersOnly', {default: false});
    const groupBy = defineModel<GroupByOption>('groupBy', {default: 'none'});

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
            <RepositoryFilter v-model="selectedRepositoryIds" />
            <TopicFilter v-model="selectedTopics" />
            <GroupByFilter v-model="groupBy" />

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
