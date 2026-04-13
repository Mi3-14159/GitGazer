<script setup lang="ts">
    import Badge from '@/components/ui/Badge.vue';
import Button from '@/components/ui/Button.vue';
import { ORG_SYNC_DEFAULT_ROLES, type OrgSyncDefaultRole } from '@common/types';
import { Shield, Users } from 'lucide-vue-next';
import { ref, watch } from 'vue';

    const props = defineProps<{
        integrationId: string;
        currentRole: OrgSyncDefaultRole;
        readonly?: boolean;
    }>();

    const emit = defineEmits<{
        'update-role': [integrationId: string, role: OrgSyncDefaultRole];
    }>();

    const isEditing = ref(false);
    const selectedRole = ref<OrgSyncDefaultRole>(props.currentRole);
    const isSaving = ref(false);

    watch(
        () => props.currentRole,
        () => {
            isSaving.value = false;
            isEditing.value = false;
        },
    );

    const ROLE_LABELS: Record<OrgSyncDefaultRole, string> = {
        viewer: 'Viewer',
        member: 'Member',
        admin: 'Admin',
    };

    const ROLE_DESCRIPTIONS: Record<OrgSyncDefaultRole, string> = {
        viewer: 'Read-only access to workflows and dashboards',
        member: 'Can manage notification rules',
        admin: 'Full access except integration deletion',
    };

    function startEditing() {
        selectedRole.value = props.currentRole;
        isEditing.value = true;
    }

    function cancelEditing() {
        isEditing.value = false;
        selectedRole.value = props.currentRole;
    }

    function saveRole() {
        if (selectedRole.value === props.currentRole) {
            isEditing.value = false;
            return;
        }
        isSaving.value = true;
        emit('update-role', props.integrationId, selectedRole.value);
    }


</script>

<template>
    <div class="border-t pt-2">
        <div class="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-2">
            <Users class="h-3 w-3" />
            Org Sync Default Role
        </div>
        <div class="flex items-center gap-2 flex-wrap">
            <template v-if="isEditing">
                <button
                    v-for="role in ORG_SYNC_DEFAULT_ROLES"
                    :key="role"
                    class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer"
                    :class="
                        selectedRole === role
                            ? 'bg-primary/10 border-primary text-primary'
                            : 'bg-muted/50 border-border text-muted-foreground hover:border-primary/50'
                    "
                    :title="ROLE_DESCRIPTIONS[role]"
                    @click="selectedRole = role"
                >
                    <Shield class="h-3 w-3" />
                    {{ ROLE_LABELS[role] }}
                </button>
                <div class="flex items-center gap-1 ml-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        class="h-6 px-2 text-xs"
                        :disabled="isSaving"
                        @click="saveRole"
                    >
                        {{ isSaving ? 'Saving…' : 'Save' }}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        class="h-6 px-2 text-xs"
                        :disabled="isSaving"
                        @click="cancelEditing"
                    >
                        Cancel
                    </Button>
                </div>
            </template>
            <template v-else>
                <Badge
                    variant="secondary"
                    class="text-xs h-5 px-1.5 transition-colors"
                    :class="!readonly ? 'cursor-pointer hover:bg-accent' : ''"
                    :title="ROLE_DESCRIPTIONS[currentRole]"
                    @click="!readonly && startEditing()"
                >
                    <Shield class="h-3 w-3 mr-1" />
                    {{ ROLE_LABELS[currentRole] }}
                </Badge>
                <button
                    v-if="!readonly"
                    class="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    @click="startEditing()"
                >
                    Edit
                </button>
            </template>
        </div>
    </div>
</template>
