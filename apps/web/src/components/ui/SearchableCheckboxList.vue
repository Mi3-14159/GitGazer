<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Checkbox from '@/components/ui/Checkbox.vue';
    import Input from '@/components/ui/Input.vue';
    import {Search} from 'lucide-vue-next';
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
    }>();

    const emit = defineEmits<{
        toggle: [value: string];
        clear: [];
    }>();

    const searchTerm = ref('');

    const filteredOptions = computed(() => {
        const term = searchTerm.value.toLowerCase();
        if (!term) return props.options;
        return props.options.filter((opt) => opt.label.toLowerCase().includes(term));
    });
</script>

<template>
    <div class="space-y-2">
        <div class="relative">
            <Search class="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
                v-model="searchTerm"
                :placeholder="placeholder ?? 'Search...'"
                class="pl-7 h-8 text-sm"
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
                    >&quot;{{ option.count }}&quot;</span
                >
            </label>
            <p
                v-if="filteredOptions.length === 0"
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
