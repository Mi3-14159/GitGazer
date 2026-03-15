<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Dialog from '@/components/ui/Dialog.vue';
    import Input from '@/components/ui/Input.vue';
    import type {Integration} from '@common/types';
    import {ref, watch} from 'vue';

    const props = defineProps<{
        open: boolean;
        integration: Integration | null;
    }>();

    const emit = defineEmits<{
        'update:open': [value: boolean];
        confirm: [];
    }>();

    const confirmText = ref('');

    watch(
        () => props.open,
        (v) => {
            if (!v) confirmText.value = '';
        },
    );
</script>

<template>
    <Dialog
        :open="open"
        @update:open="emit('update:open', $event)"
    >
        <template #default="{close}">
            <h3 class="text-lg font-semibold">Delete Integration</h3>
            <p class="mt-2 text-sm text-muted-foreground">
                This action cannot be undone. This will permanently delete the integration and all associated data.
            </p>
            <div
                v-if="integration"
                class="space-y-4 py-4"
            >
                <p class="text-sm">
                    Please type <span class="font-semibold">{{ integration.label }}</span> to confirm.
                </p>
                <Input
                    v-model="confirmText"
                    placeholder="Type integration label here"
                    autofocus
                />
            </div>
            <div class="flex justify-end gap-2 mt-4">
                <Button
                    variant="outline"
                    @click="
                        () => {
                            confirmText = '';
                            close();
                        }
                    "
                    >Cancel</Button
                >
                <Button
                    variant="destructive"
                    :disabled="confirmText !== integration?.label"
                    @click="emit('confirm')"
                    >Delete Integration</Button
                >
            </div>
        </template>
    </Dialog>
</template>
