<script setup lang="ts">
    import DefaultBranchFilter from '@/components/filters/DefaultBranchFilter.vue';
    import GroupByFilter from '@/components/filters/GroupByFilter.vue';
    import RepositoryFilter from '@/components/filters/RepositoryFilter.vue';
    import TopicFilter from '@/components/filters/TopicFilter.vue';
    import UsersOnlyFilter from '@/components/filters/UsersOnlyFilter.vue';
    import type {GroupByOption} from '@common/types';
    import {ChevronDown, SlidersHorizontal} from 'lucide-vue-next';
    import {computed, ref} from 'vue';

    const repositoryIds = defineModel<number[]>('repositoryIds', {required: true});
    const topics = defineModel<string[]>('topics', {required: true});
    const defaultBranchOnly = defineModel<boolean>('defaultBranchOnly', {required: true});
    const usersOnly = defineModel<boolean>('usersOnly', {required: true});
    const groupBy = defineModel<GroupByOption>('groupBy', {required: true});

    const filtersOpen = ref(false);

    const activeFilterCount = computed(() => {
        let count = 0;
        if (repositoryIds.value.length) count++;
        if (topics.value.length) count++;
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
            <RepositoryFilter v-model="repositoryIds" />
            <TopicFilter v-model="topics" />
            <GroupByFilter v-model="groupBy" />

            <div class="hidden sm:block h-5 w-px bg-border" />

            <DefaultBranchFilter v-model="defaultBranchOnly" />
            <UsersOnlyFilter v-model="usersOnly" />
        </div>
    </div>
</template>
