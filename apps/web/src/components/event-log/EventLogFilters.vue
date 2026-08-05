<script setup lang="ts">
    import EventCategoryFilter from '@/components/filters/EventCategoryFilter.vue';
    import EventTypeFilter from '@/components/filters/EventTypeFilter.vue';
    import IntegrationFilter from '@/components/filters/IntegrationFilter.vue';
    import ReadStatusFilter from '@/components/filters/ReadStatusFilter.vue';
    import RepositoryFilter from '@/components/filters/RepositoryFilter.vue';
    import TopicFilter from '@/components/filters/TopicFilter.vue';
    import Input from '@/components/ui/Input.vue';
    import type {FilterMode} from '@common/types';
    import {Search} from 'lucide-vue-next';

    const type = defineModel<string[]>('type', {required: true});
    const typeMode = defineModel<FilterMode>('typeMode', {required: true});
    const read = defineModel<string[]>('read', {required: true});
    const category = defineModel<string[]>('category', {required: true});
    const categoryMode = defineModel<FilterMode>('categoryMode', {required: true});
    const search = defineModel<string>('search', {required: true});
    const repositoryIds = defineModel<number[]>('repositoryIds', {required: true});
    const repositoryIdsMode = defineModel<FilterMode>('repositoryIdsMode', {required: true});
    const topics = defineModel<string[]>('topics', {required: true});
    const topicsMode = defineModel<FilterMode>('topicsMode', {required: true});
    const integrationIds = defineModel<string[]>('integrationIds', {required: true});
    const integrationIdsMode = defineModel<FilterMode>('integrationIdsMode', {required: true});
</script>

<template>
    <div class="flex flex-col gap-3">
        <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
                v-model="search"
                placeholder="Search events..."
                class="pl-9"
            />
        </div>

        <div class="flex flex-col sm:flex-row items-center gap-2">
            <div class="flex flex-wrap items-center gap-2">
                <EventTypeFilter
                    v-model="type"
                    v-model:mode="typeMode"
                    excludable
                />
                <ReadStatusFilter v-model="read" />
                <EventCategoryFilter
                    v-model="category"
                    v-model:mode="categoryMode"
                    excludable
                />
                <RepositoryFilter
                    v-model="repositoryIds"
                    v-model:mode="repositoryIdsMode"
                    excludable
                />
                <TopicFilter
                    v-model="topics"
                    v-model:mode="topicsMode"
                    excludable
                />
                <IntegrationFilter
                    v-model="integrationIds"
                    v-model:mode="integrationIdsMode"
                    excludable
                />
            </div>
            <div class="sm:ml-auto">
                <slot />
            </div>
        </div>
    </div>
</template>
