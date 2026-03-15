<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Dialog from '@/components/ui/Dialog.vue';

    defineProps<{
        open: boolean;
    }>();

    defineEmits<{
        'update:open': [value: boolean];
        confirm: [];
    }>();
</script>

<template>
    <Dialog
        :open="open"
        @update:open="$emit('update:open', $event)"
    >
        <template #default="{close}">
            <h3 class="text-lg font-semibold">Delete Notification Rule</h3>
            <p class="mt-2 text-sm text-muted-foreground">Are you sure you want to delete this notification rule? This action cannot be undone.</p>
            <div class="flex justify-end gap-2 mt-6">
                <Button
                    variant="outline"
                    @click="close"
                    >Cancel</Button
                >
                <Button
                    variant="destructive"
                    @click="$emit('confirm')"
                    >Delete</Button
                >
            </div>
        </template>
    </Dialog>
</template>
