<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Input from '@/components/ui/Input.vue';
    import Label from '@/components/ui/Label.vue';
    import {Integration} from '@common/types';
    import {X} from 'lucide-vue-next';
    import {ref} from 'vue';

    const WEBHOOK_EVENT_OPTIONS = [
        {value: 'workflow_run', label: 'Workflow Run', description: 'When a workflow run is requested or completed'},
        {value: 'workflow_job', label: 'Workflow Job', description: 'When a workflow job is queued, started, or completed'},
        {value: 'pull_request', label: 'Pull Request', description: 'When a pull request is opened, closed, or synchronized'},
    ];

    const props = defineProps<{
        integration?: Integration | null;
        webhookUrl?: string;
        enabledEvents?: string[];
        onClose: () => void;
        onSave: (label: string, id?: string) => void;
    }>();

    const isEdit = !!props.integration;
    const isLinked = !!(props.integration?.githubAppInstallations && props.integration.githubAppInstallations.length > 0);
    const label = ref(props.integration?.label ?? '');
    const selectedEvents = ref<Set<string>>(new Set(props.enabledEvents ?? []));
    const errorMsg = ref('');

    function toggleEvent(event: string) {
        if (selectedEvents.value.has(event)) {
            selectedEvents.value.delete(event);
        } else {
            selectedEvents.value.add(event);
        }
    }

    const handleSave = () => {
        if (!label.value.trim()) {
            errorMsg.value = 'Label is required';
            return;
        }
        errorMsg.value = '';
        props.onSave(label.value, props.integration?.integrationId);
    };
</script>

<template>
    <div>
        <!-- Header with X close -->
        <div class="flex items-start justify-between mb-4">
            <div>
                <h3 class="text-lg font-semibold">{{ isEdit ? 'Edit Integration' : 'New Integration' }}</h3>
                <p class="text-sm text-muted-foreground">
                    {{ isEdit ? 'Modify integration settings' : 'Create a new integration' }}
                </p>
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
            <!-- Integration Label -->
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

            <!-- Webhook URL -->
            <!-- Webhook Secret -->

            <!-- Webhook Events -->
            <div
                v-if="isLinked"
                class="space-y-3"
            >
                <Label>Webhook Events</Label>
                <div class="space-y-2">
                    <label
                        v-for="event in WEBHOOK_EVENT_OPTIONS"
                        :key="event.value"
                        class="flex items-start gap-3 cursor-pointer"
                    >
                        <input
                            type="checkbox"
                            :checked="selectedEvents.has(event.value)"
                            class="mt-0.5 h-4 w-4 rounded border-border accent-primary cursor-pointer"
                            @change="toggleEvent(event.value)"
                        />
                        <div>
                            <span class="text-sm font-medium">{{ event.label }}</span>
                            <p class="text-xs text-muted-foreground">{{ event.description }}</p>
                        </div>
                    </label>
                </div>
            </div>
        </div>

        <!-- Footer buttons -->
        <div class="flex justify-end gap-2 mt-6 pt-4 border-t">
            <Button
                variant="outline"
                @click="props.onClose"
            >
                Cancel
            </Button>
            <Button @click="handleSave">Save Changes</Button>
        </div>
    </div>
</template>
