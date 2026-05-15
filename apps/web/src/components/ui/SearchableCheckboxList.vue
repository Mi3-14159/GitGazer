<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Checkbox from '@/components/ui/Checkbox.vue';
    import Input from '@/components/ui/Input.vue';
    import {Loader2, Search} from 'lucide-vue-next';
    import {computed, ref} from 'vue';

    export interface CheckboxOption {
        value: string;
        label: string;
        count?: number;
    }

    const props = defineProps<{
        options: CheckboxOption[];
        selected: string[];
        placeholder?: string;
        emptyMessage?: string;
        loading?: boolean;
        searchTerm?: string;
    }>();

    const emit = defineEmits<{
        toggle: [value: string];
        clear: [];
        'update:searchTerm': [value: string];
    }>();

    const internalSearch = ref('');

    const isExternalSearch = computed(() => props.searchTerm !== undefined);

    const currentSearchTerm = computed({
        get: () => (isExternalSearch.value ? props.searchTerm! : internalSearch.value),
        set: (val: string) => {
            if (isExternalSearch.value) {
                emit('update:searchTerm', val);
            } else {
                internalSearch.value = val;
            }
        },
    });

    const filteredOptions = computed(() => {
        if (isExternalSearch.value) return props.options;
        const term = internalSearch.value.toLowerCase();
        if (!term) return props.options;
        return props.options.filter((opt) => opt.label.toLowerCase().includes(term));
    });
</script>

<template>
    <div class="space-y-2">
        <div class="relative">
            <Search class="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
                v-model="currentSearchTerm"
                :placeholder="placeholder ?? 'Search...'"
                class="pl-7 h-8 text-sm"
            />
            <Loader2
                v-if="loading"
                class="absolute right-2 top-2.5 h-3.5 w-3.5 text-muted-foreground animate-spin"
            />
        </div>
        <div class="max-h-48 overflow-y-auto space-y-0.5">
            <label
                v-for="option in filteredOptions"
                :key="option.value"
                class="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted cursor-pointer"
            >
                <Checkbox
                    :model-value="selected.includes(option.value)"
                    @update:model-value="emit('toggle', option.value)"
                />
                <span class="flex-1 truncate">{{ option.label }}</span>
                <span
                    v-if="option.count != null"
                    class="text-xs text-muted-foreground"
                    >{{ option.count }}</span
                >
            </label>
            <p
                v-if="filteredOptions.length === 0 && !loading"
                class="text-xs text-muted-foreground px-2 py-1"
            >
                {{ emptyMessage ?? 'No results found' }}
            </p>
        </div>
        <Button
            v-if="selected.length > 0"
            variant="ghost"
            size="sm"
            class="w-full text-xs"
            @click="emit('clear')"
        >
            Clear selection
        </Button>
    </div>
</template>
