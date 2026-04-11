<script setup lang="ts">
    import GitHubInstallation from '@/components/integrations/GitHubInstallation.vue';
    import IntegrationHeader from '@/components/integrations/IntegrationHeader.vue';
    import WebhookCredentials from '@/components/integrations/WebhookCredentials.vue';
    import WebhookEventEditor from '@/components/integrations/WebhookEventEditor.vue';
    import Card from '@/components/ui/Card.vue';
    import CardContent from '@/components/ui/CardContent.vue';
    import {formatDate} from '@/utils/formatDate';
    import type {IntegrationWithRole, MemberRole} from '@common/types';
    import {hasRole} from '@common/types';
    import {Calendar} from 'lucide-vue-next';

    const props = defineProps<{
        integration: IntegrationWithRole;
        webhookUrl: string;
    }>();

    const emit = defineEmits<{
        'save-label': [id: string, label: string];
        delete: [integration: IntegrationWithRole];
        rotate: [integrationId: string];
        unlink: [integrationId: string, installationId: number];
        'save-events': [integrationId: string, installationId: number, events: string[]];
    }>();

    function can(minimumRole: MemberRole): boolean {
        return hasRole(props.integration.role, minimumRole);
    }
</script>

<template>
    <Card>
        <CardContent class="p-4">
            <div class="space-y-3">
                <IntegrationHeader
                    :integration="integration"
                    :can-rename="can('admin')"
                    :can-delete="can('owner')"
                    :can-manage-members="can('admin')"
                    @save-label="(id, label) => emit('save-label', id, label)"
                    @delete="(i) => emit('delete', i)"
                />

                <WebhookCredentials
                    :integration-id="integration.integrationId"
                    :webhook-url="webhookUrl"
                    :secret="(integration as any).secret ?? ''"
                    :can-rotate="can('admin')"
                    @rotate="(id) => emit('rotate', id)"
                />

                <WebhookEventEditor
                    v-if="integration.githubAppInstallations && integration.githubAppInstallations.length > 0"
                    :installations="integration.githubAppInstallations"
                    :readonly="!can('admin')"
                    @save-events="(intId, instId, events) => emit('save-events', intId, instId, events)"
                />

                <div
                    v-if="integration.githubAppInstallations && integration.githubAppInstallations.length > 0"
                    class="border-t pt-2"
                >
                    <GitHubInstallation
                        v-for="inst in integration.githubAppInstallations"
                        :key="inst.installationId"
                        :installation="inst"
                        :integration-id="integration.integrationId"
                        :can-unlink="can('admin')"
                        @unlink="(intId, instId) => emit('unlink', intId, instId)"
                    />
                </div>

                <div class="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar class="h-3 w-3" />
                    Created {{ formatDate(integration.createdAt) }}
                </div>
            </div>
        </CardContent>
    </Card>
</template>
