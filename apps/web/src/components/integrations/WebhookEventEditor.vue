<script setup lang="ts">
    import Badge from '@/components/ui/Badge.vue';
    import Button from '@/components/ui/Button.vue';
    import {formatEventName} from '@/utils/formatDate';
    import {CheckCircle2, XCircle, Zap} from 'lucide-vue-next';
    import {reactive} from 'vue';

    const SUPPORTED_EVENTS = ['workflow_run', 'workflow_job', 'pull_request', 'pull_request_review'] as const;

    const props = defineProps<{
        installations: any[];
    }>();

    const emit = defineEmits<{
        'save-events': [integrationId: string, installationId: number, events: string[]];
    }>();

    const editingEvents = reactive<Record<number, Set<string>>>({});
    const savingEvents = reactive<Record<number, boolean>>({});

    function getInstallationEvents(inst: any): string[] {
        const events = new Set<string>();
        inst.webhooks?.forEach((w: any) => {
            if (Array.isArray(w.events)) {
                w.events.forEach((e: string) => events.add(e));
            }
        });
        return Array.from(events);
    }

    function startEditing(instId: number, currentEvents: string[]) {
        editingEvents[instId] = new Set(currentEvents);
    }

    function cancelEditing(instId: number) {
        delete editingEvents[instId];
    }

    function toggleEvent(instId: number, event: string) {
        const set = editingEvents[instId];
        if (!set) return;
        if (set.has(event)) set.delete(event);
        else set.add(event);
        editingEvents[instId] = new Set(set);
    }

    function saveEvents(instId: number) {
        const events = editingEvents[instId];
        if (!events) return;
        const inst = props.installations.find((i) => i.installationId === instId);
        if (!inst) return;
        savingEvents[instId] = true;
        emit('save-events', inst.integrationId, instId, Array.from(events));
    }

    function onSaved(instId: number) {
        delete editingEvents[instId];
        savingEvents[instId] = false;
    }

    defineExpose({onSaved});
</script>

<template>
    <div
        v-if="installations.length > 0"
        class="border-t pt-2"
    >
        <div class="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-2">
            <Zap class="h-3 w-3" />
            Webhook Events
        </div>
        <div class="flex flex-wrap gap-1.5">
            <template
                v-for="inst in installations"
                :key="inst.installationId"
            >
                <!-- Editing mode -->
                <template v-if="editingEvents[inst.installationId]">
                    <button
                        v-for="event in SUPPORTED_EVENTS"
                        :key="event"
                        class="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors cursor-pointer"
                        :class="
                            editingEvents[inst.installationId]?.has(event)
                                ? 'bg-primary/10 border-primary text-primary'
                                : 'bg-muted/50 border-border text-muted-foreground hover:border-primary/50'
                        "
                        @click="toggleEvent(inst.installationId, event)"
                    >
                        <CheckCircle2
                            v-if="editingEvents[inst.installationId]?.has(event)"
                            class="h-3 w-3"
                        />
                        <XCircle
                            v-else
                            class="h-3 w-3"
                        />
                        {{ formatEventName(event) }}
                    </button>
                    <div class="flex items-center gap-1 ml-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            class="h-6 px-2 text-xs"
                            :disabled="savingEvents[inst.installationId]"
                            @click="saveEvents(inst.installationId)"
                        >
                            {{ savingEvents[inst.installationId] ? 'Saving…' : 'Save' }}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            class="h-6 px-2 text-xs"
                            :disabled="savingEvents[inst.installationId]"
                            @click="cancelEditing(inst.installationId)"
                        >
                            Cancel
                        </Button>
                    </div>
                </template>
                <!-- Read-only mode -->
                <template v-else>
                    <Badge
                        v-for="event in getInstallationEvents(inst)"
                        :key="event"
                        variant="secondary"
                        class="text-xs h-5 px-1.5 cursor-pointer hover:bg-accent transition-colors"
                        @click="startEditing(inst.installationId, getInstallationEvents(inst))"
                    >
                        {{ formatEventName(event) }}
                    </Badge>
                    <Badge
                        v-if="getInstallationEvents(inst).length === 0"
                        variant="outline"
                        class="text-xs h-5 px-1.5 cursor-pointer hover:bg-accent transition-colors text-muted-foreground"
                        @click="startEditing(inst.installationId, [])"
                    >
                        No events — click to configure
                    </Badge>
                    <button
                        v-if="getInstallationEvents(inst).length > 0"
                        class="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
                        @click="startEditing(inst.installationId, getInstallationEvents(inst))"
                    >
                        Edit
                    </button>
                </template>
            </template>
        </div>
    </div>
</template>
