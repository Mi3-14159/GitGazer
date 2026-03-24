<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Input from '@/components/ui/Input.vue';
    import Label from '@/components/ui/Label.vue';
    import {X} from 'lucide-vue-next';
    import {ref} from 'vue';

    const props = defineProps<{
        onClose: () => void;
        onSave: (label: string) => void;
    }>();

    const label = ref('');
    const errorMsg = ref('');

    const handleSave = () => {
        if (!label.value.trim()) {
            errorMsg.value = 'Label is required';
            return;
        }
        errorMsg.value = '';
        props.onSave(label.value);
    };
</script>

<template>
    <div>
        <div class="flex items-start justify-between mb-4">
            <div>
                <h3 class="text-lg font-semibold">New Integration</h3>
                <p class="text-sm text-muted-foreground">Create a new integration</p>
            </div>
            <Button
                variant="ghost"
                size="sm"
                class="h-8 w-8 p-0 -mt-1 -mr-1"
                @click="props.onClose"
            >
                <X class="h-4 w-4" />
            </Button>
        </div>

        <div class="space-y-4">
            <div class="space-y-2">
                <Label>Integration Label</Label>
                <Input
                    v-model="label"
                    placeholder="e.g. Production Workflows"
                    autofocus
                    @keyup.enter="handleSave"
                />
                <p
                    v-if="errorMsg"
                    class="text-xs text-destructive"
                >
                    {{ errorMsg }}
                </p>
            </div>
        </div>

        <div class="flex justify-end gap-2 mt-6 pt-4 border-t">
            <Button
                variant="outline"
                @click="props.onClose"
            >
                Cancel
            </Button>
            <Button @click="handleSave">Create</Button>
        </div>
    </div>
</template>
