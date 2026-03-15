<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Dialog from '@/components/ui/Dialog.vue';

    defineProps<{
        open: boolean;
        isRotating: boolean;
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
            <h3 class="text-lg font-semibold">Are you sure?</h3>
            <p class="mt-2 text-sm text-muted-foreground">This action will permanently rotate the secret and cannot be undone.</p>
            <div class="flex justify-end gap-2 mt-6">
                <Button
                    variant="outline"
                    @click="close"
                    >Cancel</Button
                >
                <Button
                    variant="destructive"
                    :disabled="isRotating"
                    @click="emit('confirm')"
                    >{{ isRotating ? 'Rotating…' : 'Rotate' }}</Button
                >
            </div>
        </template>
    </Dialog>
</template>
