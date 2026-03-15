<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Dialog from '@/components/ui/Dialog.vue';

    defineProps<{
        open: boolean;
        isUnlinking: boolean;
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
            <h3 class="text-lg font-semibold">Unlink GitHub App?</h3>
            <p class="mt-2 text-sm text-muted-foreground">
                This will remove the link between this integration and the GitHub App installation. Existing webhooks for this installation will be
                deleted.
            </p>
            <div class="flex justify-end gap-2 mt-6">
                <Button
                    variant="outline"
                    @click="close"
                    >Cancel</Button
                >
                <Button
                    variant="destructive"
                    :disabled="isUnlinking"
                    @click="emit('confirm')"
                    >{{ isUnlinking ? 'Unlinking…' : 'Unlink' }}</Button
                >
            </div>
        </template>
    </Dialog>
</template>
