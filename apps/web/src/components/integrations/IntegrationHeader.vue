<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Input from '@/components/ui/Input.vue';
    import {formatTimeSince} from '@/utils/formatDate';
    import type {Integration} from '@common/types';
    import {Activity, Trash2} from 'lucide-vue-next';
    import {nextTick, ref} from 'vue';

    const props = defineProps<{
        integration: Integration;
    }>();

    const emit = defineEmits<{
        'save-label': [id: string, label: string];
        delete: [integration: Integration];
    }>();

    const isEditing = ref(false);
    const editLabel = ref('');
    const inputRef = ref<HTMLInputElement | null>();

    function startEditing() {
        editLabel.value = props.integration.label;
        isEditing.value = true;
        nextTick(() => inputRef.value?.focus());
    }

    function cancelEditing() {
        isEditing.value = false;
    }

    function saveLabel() {
        if (!editLabel.value.trim()) return cancelEditing();
        emit('save-label', props.integration.integrationId, editLabel.value);
        isEditing.value = false;
    }

    function getLastActivity(): string | null {
        const installations = props.integration.githubAppInstallations;
        if (!installations || installations.length === 0) return null;
        let latest: Date | null = null;
        for (const inst of installations) {
            const d = new Date(inst.updatedAt);
            if (!latest || d > latest) latest = d;
        }
        return latest ? formatTimeSince(latest) : null;
    }
</script>

<template>
    <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-2 flex-wrap flex-1 min-w-0">
            <template v-if="isEditing">
                <div class="flex items-center gap-1">
                    <Input
                        :ref="
                            (el: any) => {
                                if (el?.$el) inputRef = el.$el;
                            }
                        "
                        :model-value="editLabel"
                        class="!h-7 text-sm max-w-xs"
                        @update:model-value="(v: string) => (editLabel = v)"
                        @keydown.enter="saveLabel"
                        @keydown.escape="cancelEditing"
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        class="h-7 px-2"
                        @click="saveLabel"
                    >
                        Save
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        class="h-7 px-2"
                        @click="cancelEditing"
                    >
                        Cancel
                    </Button>
                </div>
            </template>
            <template v-else>
                <h3
                    class="font-semibold text-base cursor-pointer hover:text-primary transition-colors break-words min-w-0"
                    @click="startEditing"
                >
                    {{ integration.label }}
                </h3>
            </template>
            <span
                v-if="getLastActivity()"
                class="text-xs text-muted-foreground flex items-center gap-1"
            >
                <Activity class="h-3 w-3" />
                {{ getLastActivity() }}
            </span>
        </div>
        <Button
            variant="ghost"
            size="sm"
            class="h-8 w-8 p-0 text-destructive hover:text-destructive shrink-0"
            @click="emit('delete', integration)"
        >
            <Trash2 class="h-3.5 w-3.5" />
        </Button>
    </div>
</template>
