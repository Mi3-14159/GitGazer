<script setup lang="ts">
    import {APP_INFO} from '@/components/apps/appCatalog';
    import Button from '@/components/ui/Button.vue';
    import Dialog from '@/components/ui/Dialog.vue';
    import type {IntegrationAppType} from '@common/types';

    defineProps<{
        open: boolean;
        type: IntegrationAppType | null;
        removing: boolean;
        error: string | null;
    }>();

    const emit = defineEmits<{
        'update:open': [value: boolean];
        confirm: [];
    }>();

    const CONSEQUENCES: Record<IntegrationAppType, string[]> = {
        github: [
            'Ingest stops: every GitHub App installation is unlinked, the webhooks GitGazer created are removed and the webhook secret is deleted, so further deliveries are rejected.',
            'Collected data, org-synced members and their roles are kept. Installing the app again creates a new secret.',
        ],
        webhook: [
            'All handles and their webhook URLs are deleted. Notification rules that use them stop sending to them.',
            'The rules themselves are kept.',
        ],
    };
</script>

<template>
    <Dialog
        :open="open"
        @update:open="emit('update:open', $event)"
    >
        <template #default="{close}">
            <template v-if="type">
                <h3 class="text-lg font-semibold">Remove {{ APP_INFO[type].name }} app?</h3>
                <p
                    v-for="line in CONSEQUENCES[type]"
                    :key="line"
                    class="mt-2 text-sm text-muted-foreground"
                >
                    {{ line }}
                </p>
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
                        :loading="removing"
                        @click="emit('confirm')"
                    >
                        Remove app
                    </Button>
                </div>
            </template>
        </template>
    </Dialog>
</template>
