<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Dialog from '@/components/ui/Dialog.vue';
    import type {NotificationHandle} from '@common/types';
    import {TriangleAlert} from '@lucide/vue';

    defineProps<{
        open: boolean;
        handle: NotificationHandle | null;
        deleting: boolean;
        error: string | null;
    }>();

    const emit = defineEmits<{
        'update:open': [value: boolean];
        confirm: [];
    }>();
</script>

<template>
    <Dialog
        :open="open"
        @update:open="emit('update:open', $event)"
    >
        <template #default="{close}">
            <h3 class="text-lg font-semibold">Delete handle “{{ handle?.name }}”?</h3>
            <p class="mt-2 text-sm text-muted-foreground">
                {{ handle?.channelName ? `GitGazer stops posting to #${handle.channelName}.` : 'GitGazer forgets this webhook URL.' }} This cannot be
                undone.
            </p>
            <div
                v-if="handle && handle.ruleCount > 0"
                class="mt-4 flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
            >
                <TriangleAlert
                    class="mt-0.5 size-4 shrink-0 text-warning"
                    aria-hidden="true"
                />
                <p>
                    Used by {{ handle.ruleCount }} {{ handle.ruleCount === 1 ? 'rule' : 'rules' }}. They stop sending to this handle; a rule left
                    without handles sends nothing.
                </p>
            </div>
            <p
                v-if="error"
                role="alert"
                class="mt-4 text-sm text-destructive"
            >
                {{ error }}
            </p>
            <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                    variant="outline"
                    @click="close"
                >
                    Cancel
                </Button>
                <Button
                    variant="destructive"
                    :loading="deleting"
                    @click="emit('confirm')"
                >
                    Delete handle
                </Button>
            </div>
        </template>
    </Dialog>
</template>
