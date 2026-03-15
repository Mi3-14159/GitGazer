<script setup lang="ts">
    import Badge from '@/components/ui/Badge.vue';
    import Button from '@/components/ui/Button.vue';
    import Card from '@/components/ui/Card.vue';
    import CardContent from '@/components/ui/CardContent.vue';
    import Dialog from '@/components/ui/Dialog.vue';
    import Input from '@/components/ui/Input.vue';
    import type {Integration} from '@common/types';
    import {Calendar, Github, Webhook} from 'lucide-vue-next';
    import {computed, ref, watch} from 'vue';

    const props = defineProps<{
        open: boolean;
        installationId: number | null;
        integrations: Integration[];
        error?: string;
    }>();

    const emit = defineEmits<{
        'update:open': [value: boolean];
        linkToExisting: [integrationId: string, installationId: number];
        createAndLink: [label: string, installationId: number];
    }>();

    const linkMode = ref<'existing' | 'new'>('existing');
    const selectedIntegrationId = ref('');
    const newIntegrationLabel = ref('');

    // Filter to integrations that don't already have a GitHub App linked
    const availableIntegrations = computed(() =>
        props.integrations.filter((int) => !int.githubAppInstallations || int.githubAppInstallations.length === 0),
    );

    // Reset state when dialog opens
    watch(
        () => props.open,
        (isOpen) => {
            if (isOpen) {
                linkMode.value = availableIntegrations.value.length > 0 ? 'existing' : 'new';
                selectedIntegrationId.value = '';
                newIntegrationLabel.value = '';
            }
        },
    );

    const isConfirmDisabled = computed(
        () => (linkMode.value === 'existing' && !selectedIntegrationId.value) || (linkMode.value === 'new' && !newIntegrationLabel.value.trim()),
    );

    function handleConfirm() {
        if (!props.installationId) return;

        if (linkMode.value === 'existing' && selectedIntegrationId.value) {
            emit('linkToExisting', selectedIntegrationId.value, props.installationId);
        } else if (linkMode.value === 'new' && newIntegrationLabel.value.trim()) {
            emit('createAndLink', newIntegrationLabel.value.trim(), props.installationId);
        }
    }

    function formatDate(dateStr: string | Date) {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return 'today';
        if (diffDays === 1) return 'yesterday';
        if (diffDays < 30) return `${diffDays} days ago`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
        return `${Math.floor(diffDays / 365)} years ago`;
    }
</script>

<template>
    <Dialog
        :open="open"
        class="max-w-2xl"
        @update:open="emit('update:open', $event)"
    >
        <template #default="{close}">
            <!-- Header -->
            <div class="space-y-1.5 mb-4">
                <h3 class="text-lg font-semibold flex items-center gap-2">
                    <Github class="h-5 w-5" />
                    GitHub App Installed Successfully
                </h3>
                <p class="text-sm text-muted-foreground">Link your GitHub App installation to an integration to start receiving webhook events.</p>
            </div>

            <div
                v-if="installationId"
                class="space-y-4"
            >
                <!-- GitHub App Info Card -->
                <Card class="bg-muted/50">
                    <CardContent class="p-4 !pt-4">
                        <div class="space-y-2">
                            <div class="flex items-center gap-2 font-medium">
                                <Github class="h-4 w-4" />
                                GitHub App Installation
                            </div>
                            <div class="text-sm">
                                <div class="text-muted-foreground">Installation ID</div>
                                <div class="font-mono">{{ installationId }}</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <!-- Link Mode Selection -->
                <div class="space-y-3">
                    <!-- Link to Existing -->
                    <label class="flex items-start space-x-3 cursor-pointer">
                        <input
                            v-model="linkMode"
                            type="radio"
                            value="existing"
                            class="mt-1 h-4 w-4 accent-primary"
                        />
                        <div class="flex-1 space-y-2">
                            <span class="font-medium text-sm">Link to existing integration</span>
                            <div v-if="linkMode === 'existing'">
                                <div
                                    v-if="availableIntegrations.length > 0"
                                    class="space-y-2 max-h-48 overflow-y-auto pt-2"
                                >
                                    <Card
                                        v-for="integration in availableIntegrations"
                                        :key="integration.integrationId"
                                        class="cursor-pointer transition-colors"
                                        :class="
                                            selectedIntegrationId === integration.integrationId
                                                ? 'border-primary bg-primary/5'
                                                : 'hover:border-primary/50'
                                        "
                                        @click="selectedIntegrationId = integration.integrationId"
                                    >
                                        <CardContent class="p-3 !pt-3">
                                            <div class="flex items-start justify-between gap-2">
                                                <div class="space-y-1">
                                                    <div class="font-medium text-sm">{{ integration.label }}</div>
                                                    <div class="flex items-center gap-2 text-xs text-muted-foreground">
                                                        <span class="flex items-center gap-1">
                                                            <Webhook class="h-3 w-3" />
                                                            Webhook configured
                                                        </span>
                                                        <span class="flex items-center gap-1">
                                                            <Calendar class="h-3 w-3" />
                                                            Created {{ formatDate(integration.createdAt) }}
                                                        </span>
                                                    </div>
                                                </div>
                                                <Badge
                                                    v-if="selectedIntegrationId === integration.integrationId"
                                                    variant="default"
                                                    class="text-xs"
                                                >
                                                    Selected
                                                </Badge>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                                <p
                                    v-else
                                    class="text-sm text-muted-foreground pt-2"
                                >
                                    No available integrations. All existing integrations already have a GitHub App linked.
                                </p>
                            </div>
                        </div>
                    </label>

                    <!-- Create New -->
                    <label class="flex items-start space-x-3 cursor-pointer">
                        <input
                            v-model="linkMode"
                            type="radio"
                            value="new"
                            class="mt-1 h-4 w-4 accent-primary"
                        />
                        <div class="flex-1 space-y-2">
                            <span class="font-medium text-sm">Create new integration</span>
                            <div
                                v-if="linkMode === 'new'"
                                class="pt-2"
                            >
                                <Input
                                    v-model="newIntegrationLabel"
                                    placeholder="e.g., Production Workflows"
                                    autofocus
                                />
                                <p class="text-xs text-muted-foreground mt-1">
                                    A new integration will be created with auto-generated webhook URL and secret.
                                </p>
                            </div>
                        </div>
                    </label>
                </div>
            </div>

            <!-- Error message -->
            <p
                v-if="error"
                class="text-sm text-destructive"
            >
                {{ error }}
            </p>

            <!-- Footer -->
            <div class="flex justify-end gap-2 mt-6">
                <Button
                    variant="outline"
                    @click="close"
                >
                    Cancel
                </Button>
                <Button
                    :disabled="isConfirmDisabled"
                    @click="handleConfirm"
                >
                    {{ linkMode === 'existing' ? 'Link to Integration' : 'Create and Link' }}
                </Button>
            </div>
        </template>
    </Dialog>
</template>
