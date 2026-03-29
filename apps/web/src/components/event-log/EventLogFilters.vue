<script setup lang="ts">
    import EventCategoryFilter from '@/components/filters/EventCategoryFilter.vue';
    import EventTypeFilter from '@/components/filters/EventTypeFilter.vue';
    import IntegrationFilter from '@/components/filters/IntegrationFilter.vue';
    import ReadStatusFilter from '@/components/filters/ReadStatusFilter.vue';
    import RepositoryFilter from '@/components/filters/RepositoryFilter.vue';
    import TopicFilter from '@/components/filters/TopicFilter.vue';
    import Input from '@/components/ui/Input.vue';
    import {Search} from 'lucide-vue-next';

    const type = defineModel<string[]>('type', {required: true});
    const read = defineModel<string[]>('read', {required: true});
    const category = defineModel<string[]>('category', {required: true});
    const search = defineModel<string>('search', {required: true});
    const repositoryIds = defineModel<number[]>('repositoryIds', {required: true});
    const topics = defineModel<string[]>('topics', {required: true});
    const integrationIds = defineModel<string[]>('integrationIds', {required: true});
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
                <EventTypeFilter v-model="type" />
                <ReadStatusFilter v-model="read" />
                <EventCategoryFilter v-model="category" />
                <RepositoryFilter v-model="repositoryIds" />
                <TopicFilter v-model="topics" />
                <IntegrationFilter v-model="integrationIds" />
            </div>
            <div class="sm:ml-auto">
                <slot />
            </div>
        </div>
    </div>
</template>
