<script setup lang="ts">
    import Button from '@/components/ui/Button.vue';
    import Input from '@/components/ui/Input.vue';
    import Label from '@/components/ui/Label.vue';
    import {hasRole, type IntegrationWithRole} from '@common/types';
    import {LogOut, Trash2} from '@lucide/vue';
    import {computed, ref, watch} from 'vue';

    const props = defineProps<{
        integration: IntegrationWithRole;
    }>();

    const emit = defineEmits<{
        'save-label': [id: string, label: string];
        delete: [integration: IntegrationWithRole];
        leave: [integration: IntegrationWithRole];
    }>();

    const canRename = computed(() => hasRole(props.integration.role, 'admin'));
    const canDelete = computed(() => hasRole(props.integration.role, 'owner'));
    const canLeave = computed(() => !hasRole(props.integration.role, 'owner'));

    const label = ref(props.integration.label);
    watch(
        () => props.integration.label,
        (value) => (label.value = value),
    );

    const canSave = computed(() => label.value.trim() !== '' && label.value.trim() !== props.integration.label);

    function saveLabel() {
        if (!canSave.value) return;
        emit('save-label', props.integration.integrationId, label.value.trim());
    }
</script>

<template>
    <div class="max-w-2xl divide-y divide-border">
        <form
            v-if="canRename"
            class="space-y-2 pb-6"
            @submit.prevent="saveLabel"
        >
            <Label for="integration-name">Name</Label>
            <p class="text-sm text-muted-foreground">Shown in the integration list and to everyone who is a member.</p>
            <div class="flex flex-col gap-2 sm:flex-row">
                <Input
                    id="integration-name"
                    v-model="label"
                    class="sm:max-w-sm"
                />
                <Button
                    type="submit"
                    variant="outline"
                    :disabled="!canSave"
                >
                    Rename
                </Button>
            </div>
        </form>

        <section
            v-if="canLeave"
            class="flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between"
            aria-labelledby="leave-heading"
        >
            <div>
                <h2
                    id="leave-heading"
                    class="text-sm font-medium"
                >
                    Leave integration
                </h2>
                <p class="text-sm text-muted-foreground">You lose access to its apps, rules and data until someone invites you again.</p>
            </div>
            <Button
                variant="outline"
                class="shrink-0"
                @click="emit('leave', integration)"
            >
                <LogOut class="h-4 w-4" />
                Leave
            </Button>
        </section>

        <section
            v-if="canDelete"
            class="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between"
            aria-labelledby="delete-heading"
        >
            <div>
                <h2
                    id="delete-heading"
                    class="text-sm font-medium text-destructive"
                >
                    Delete integration
                </h2>
                <p class="text-sm text-muted-foreground">Removes the integration with its apps, members and collected data. This cannot be undone.</p>
            </div>
            <Button
                variant="destructive"
                class="shrink-0"
                @click="emit('delete', integration)"
            >
                <Trash2 class="h-4 w-4" />
                Delete
            </Button>
        </section>
    </div>
</template>
