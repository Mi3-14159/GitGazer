<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Popover from '@/components/ui/Popover.vue';
    import SearchableCheckboxList from '@/components/ui/SearchableCheckboxList.vue';
    import Switch from '@/components/ui/Switch.vue';
    import {useMetrics} from '@/composables/useMetric';
    import type {GroupByOption} from '@common/types';
    import {GitBranch, Layers, Tag, User} from 'lucide-vue-next';
    import {computed, onMounted, ref} from 'vue';

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

    const groupByLabel = computed(() => groupByOptions.find((o) => o.value === groupBy.value)?.label ?? 'No grouping');
    const groupByOpen = ref(false);

    const {fetchRepositories, fetchTopics} = useMetrics();

    const repositories = ref<{id: number; name: string}[]>([]);
    const reposOpen = ref(false);

    const availableTopics = ref<string[]>([]);
    const topicsOpen = ref(false);

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

    const selectedRepoStrings = computed(() => selectedRepositoryIds.value.map(String));

    function toggleRepo(idStr: string) {
        const id = Number(idStr);
        const current = [...selectedRepositoryIds.value];
        const idx = current.indexOf(id);
        if (idx >= 0) current.splice(idx, 1);
        else current.push(id);
        selectedRepositoryIds.value = current;
    }

    const topicOptions = computed(() => availableTopics.value.map((t) => ({value: t, label: t})));

    const repoButtonLabel = computed(() => {
        if (!selectedRepositoryIds.value.length) return 'Repositories';
        const names = selectedRepositoryIds.value.map((id) => repositories.value.find((r) => r.id === id)?.name).filter(Boolean);
        if (names.length <= 2) return names.join(', ');
        return `${names.length} repos`;
    });

    const topicButtonLabel = computed(() => {
        if (!selectedTopics.value.length) return 'Topics';
        if (selectedTopics.value.length <= 2) return selectedTopics.value.join(', ');
        return `${selectedTopics.value.length} topics`;
    });

    function toggleTopic(topic: string) {
        const current = [...selectedTopics.value];
        const idx = current.indexOf(topic);
        if (idx >= 0) current.splice(idx, 1);
        else current.push(topic);
        selectedTopics.value = current;
    }
</script>

<template>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <!-- Repositories -->
        <Popover
            :open="reposOpen"
            align="start"
            content-class="w-64"
            @update:open="reposOpen = $event"
        >
            <template #trigger>
                <Button
                    variant="outline"
                    size="sm"
                    class="gap-1.5"
                    :class="{'border-primary': selectedRepositoryIds.length > 0}"
                >
                    {{ repoButtonLabel }}
                </Button>
            </template>
            <SearchableCheckboxList
                :options="repoOptions"
                :selected="selectedRepoStrings"
                placeholder="Search repositories..."
                empty-message="No repositories found"
                @toggle="toggleRepo"
                @clear="selectedRepositoryIds = []"
            />
        </Popover>

        <!-- Topics -->
        <Popover
            :open="topicsOpen"
            align="start"
            content-class="w-64"
            @update:open="topicsOpen = $event"
        >
            <template #trigger>
                <Button
                    variant="outline"
                    size="sm"
                    class="gap-1.5"
                    :class="{'border-primary': selectedTopics.length > 0}"
                >
                    <Tag class="h-3.5 w-3.5" />
                    {{ topicButtonLabel }}
                </Button>
            </template>
            <SearchableCheckboxList
                :options="topicOptions"
                :selected="selectedTopics"
                placeholder="Search topics..."
                empty-message="No topics found"
                @toggle="toggleTopic"
                @clear="selectedTopics = []"
            />
        </Popover>

        <!-- Group By -->
        <div class="flex shrink-0 items-center gap-1.5">
            <Layers class="h-3.5 w-3.5 text-muted-foreground" />
            <Popover
                :open="groupByOpen"
                align="start"
                content-class="w-48"
                @update:open="groupByOpen = $event"
            >
                <template #trigger>
                    <Button
                        variant="outline"
                        size="sm"
                        class="gap-1.5"
                        :class="{'border-primary': groupBy !== 'none'}"
                    >
                        {{ groupByLabel }}
                    </Button>
                </template>
                <div class="space-y-0.5">
                    <button
                        v-for="option in groupByOptions"
                        :key="option.value"
                        type="button"
                        class="flex w-full items-center rounded px-2 py-1.5 text-sm hover:bg-muted cursor-pointer"
                        :class="{'bg-muted font-medium': groupBy === option.value}"
                        @click="
                            groupBy = option.value;
                            groupByOpen = false;
                        "
                    >
                        {{ option.label }}
                    </button>
                </div>
            </Popover>
        </div>

        <div class="h-5 w-px bg-border" />

        <!-- Default Branch Only -->
        <label class="flex shrink-0 items-center gap-1.5 cursor-pointer">
            <Switch v-model="defaultBranchOnly" />
            <GitBranch class="h-3.5 w-3.5 text-muted-foreground" />
            <span class="text-sm text-muted-foreground whitespace-nowrap">Default branch only</span>
        </label>

        <!-- Users Only -->
        <label class="flex shrink-0 items-center gap-1.5 cursor-pointer">
            <Switch v-model="usersOnly" />
            <User class="h-3.5 w-3.5 text-muted-foreground" />
            <span class="text-sm text-muted-foreground whitespace-nowrap">Users only</span>
        </label>
    </div>
</template>
