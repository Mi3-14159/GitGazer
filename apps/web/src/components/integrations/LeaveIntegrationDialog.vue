<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Dialog from '@/components/ui/Dialog.vue';
    import type {IntegrationWithRole} from '@common/types';

    defineProps<{
        open: boolean;
        integration: IntegrationWithRole | null;
        isLeaving: boolean;
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
            <h3 class="text-lg font-semibold">Leave Integration?</h3>
            <p class="mt-2 text-sm text-muted-foreground">
                You will lose access to
                <span
                    v-if="integration"
                    class="font-semibold text-foreground"
                    >{{ integration.label }}</span
                >
                and its data. You can only rejoin if an admin sends you a new invitation.
            </p>
            <div class="flex justify-end gap-2 mt-6">
                <Button
                    variant="outline"
                    @click="close"
                    >Cancel</Button
                >
                <Button
                    variant="destructive"
                    :disabled="isLeaving"
                    @click="emit('confirm')"
                    >{{ isLeaving ? 'Leaving…' : 'Leave Integration' }}</Button
                >
            </div>
        </template>
    </Dialog>
</template>
