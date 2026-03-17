<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Checkbox from '@/components/ui/Checkbox.vue';
    import Input from '@/components/ui/Input.vue';
    import Popover from '@/components/ui/Popover.vue';
    import Switch from '@/components/ui/Switch.vue';
    import {useMetrics} from '@/composables/useMetric';
    import type {GroupByOption} from '@common/types';
    import {Filter, GitBranch, Layers, Search, User} from 'lucide-vue-next';
    import {computed, onMounted, ref} from 'vue';

    const selectedRepositoryIds = defineModel<number[]>('repositoryIds', {default: () => []});
    const defaultBranchOnly = defineModel<boolean>('defaultBranchOnly', {default: false});
    const usersOnly = defineModel<boolean>('usersOnly', {default: false});
    const groupBy = defineModel<GroupByOption>('groupBy', {default: 'none'});

    const groupByOptions: {label: string; value: GroupByOption}[] = [
        {label: 'No grouping', value: 'none'},
        {label: 'Group by Repository', value: 'repository'},
    ];

    const groupByLabel = computed(() => groupByOptions.find((o) => o.value === groupBy.value)?.label ?? 'No grouping');
    const groupByOpen = ref(false);

    const {fetchRepositories} = useMetrics();

    const repositories = ref<{id: number; name: string}[]>([]);
    const repoSearch = ref('');
    const reposOpen = ref(false);

    onMounted(async () => {
        try {
            repositories.value = await fetchRepositories();
        } catch {
            // silently fail — list stays empty
        }
    });

    const filteredRepos = computed(() => {
        const term = repoSearch.value.toLowerCase();
        if (!term) return repositories.value;
        return repositories.value.filter((r) => r.name.toLowerCase().includes(term));
    });

    function toggleRepo(id: number) {
        const current = [...selectedRepositoryIds.value];
        const idx = current.indexOf(id);
        if (idx >= 0) current.splice(idx, 1);
        else current.push(id);
        selectedRepositoryIds.value = current;
    }

    function clearRepos() {
        selectedRepositoryIds.value = [];
    }

    const repoButtonLabel = computed(() => {
        if (!selectedRepositoryIds.value.length) return 'Repositories';
        const names = selectedRepositoryIds.value.map((id) => repositories.value.find((r) => r.id === id)?.name).filter(Boolean);
        if (names.length <= 2) return names.join(', ');
        return `${names.length} repos`;
    });
</script>

<template>
    <div class="flex items-center gap-2">
        <Filter class="h-4 w-4 text-muted-foreground" />
        <span class="text-sm text-muted-foreground">Filters:</span>

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
            <div class="space-y-2">
                <div class="relative">
                    <Search class="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        v-model="repoSearch"
                        placeholder="Search repositories..."
                        class="pl-7 h-8 text-sm"
                    />
                </div>
                <div class="max-h-48 overflow-y-auto space-y-0.5">
                    <label
                        v-for="repo in filteredRepos"
                        :key="repo.id"
                        class="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted cursor-pointer"
                    >
                        <Checkbox
                            :model-value="selectedRepositoryIds.includes(repo.id)"
                            @update:model-value="toggleRepo(repo.id)"
                        />
                        <span class="truncate">{{ repo.name }}</span>
                    </label>
                    <p
                        v-if="filteredRepos.length === 0"
                        class="text-xs text-muted-foreground px-2 py-1"
                    >
                        No repositories found
                    </p>
                </div>
                <Button
                    v-if="selectedRepositoryIds.length > 0"
                    variant="ghost"
                    size="sm"
                    class="w-full text-xs"
                    @click="clearRepos"
                >
                    Clear selection
                </Button>
            </div>
        </Popover>

        <!-- Default Branch Only -->
        <label class="flex items-center gap-1.5 cursor-pointer">
            <Switch v-model="defaultBranchOnly" />
            <GitBranch class="h-3.5 w-3.5 text-muted-foreground" />
            <span class="text-sm text-muted-foreground">Default branch only</span>
        </label>

        <!-- Users Only -->
        <label class="flex items-center gap-1.5 cursor-pointer">
            <Switch v-model="usersOnly" />
            <User class="h-3.5 w-3.5 text-muted-foreground" />
            <span class="text-sm text-muted-foreground">Users only</span>
        </label>

        <!-- Group By -->
        <div class="ml-2 flex items-center gap-1.5">
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
    </div>
</template>
