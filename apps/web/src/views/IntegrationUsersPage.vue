<script setup lang="ts">
    import PageHeader from '@/components/PageHeader.vue';
    import Badge from '@/components/ui/Badge.vue';
    import Button from '@/components/ui/Button.vue';
    import Dialog from '@/components/ui/Dialog.vue';
    import EmptyState from '@/components/ui/EmptyState.vue';
    import Input from '@/components/ui/Input.vue';
    import InviteUserDialog from '@/components/users/InviteUserDialog.vue';
    import PendingInvitationCard from '@/components/users/PendingInvitationCard.vue';
    import UserCard from '@/components/users/UserCard.vue';
    import {useIntegration} from '@/composables/useIntegration';
    import {useMembers} from '@/composables/useMembers';
    import type {Invitation, TeamMember, UserInviteFormData, UserRole} from '@/types/user';
    import {hasRole, type MemberRole} from '@common/types';
    import {ArrowLeft, Clock, Loader2, Search, UserPlus, Users} from 'lucide-vue-next';
    import {computed, onMounted, ref} from 'vue';
    import {useRoute, useRouter} from 'vue-router';

    const route = useRoute();
    const router = useRouter();
    const {
        getMembers: fetchMembers,
        getInvitations: fetchInvitations,
        changeRole,
        removeMember: apiRemoveMember,
        createInvitation,
        revokeInvitation: apiRevokeInvitation,
        resendInvitation: apiResendInvitation,
    } = useMembers();
    const {getIntegrations} = useIntegration();

    const integrationId = computed(() => route.params.integrationId as string);
    const integrationLabel = computed(() => (route.query.label as string) || '');
    const userRole = ref<MemberRole>('viewer');
    const canManageMembers = computed(() => hasRole(userRole.value, 'admin'));
    const copiedLink = ref(false);
    const confirmRemoveUserId = ref<string | null>(null);
    const confirmRevokeInvitationId = ref<string | null>(null);
    const loading = ref(true);
    const error = ref<string | null>(null);

    const search = ref('');
    const showInviteDialog = ref(false);

    const members = ref<TeamMember[]>([]);
    const invitations = ref<Invitation[]>([]);

    const APP_ORIGIN = window.location.origin;

    async function loadData() {
        loading.value = true;
        error.value = null;
        try {
            const [apiMembers, apiInvitations, apiIntegrations] = await Promise.all([
                fetchMembers(integrationId.value),
                fetchInvitations(integrationId.value),
                getIntegrations(),
            ]);

            const currentIntegration = apiIntegrations?.find((i) => i.integrationId === integrationId.value);
            if (currentIntegration) {
                userRole.value = currentIntegration.role;
            }

            members.value = apiMembers.map((m) => ({
                id: String(m.userId),
                email: m.user.email ?? '',
                name: m.user.name ?? m.user.email ?? 'Unknown',
                avatar: m.user.picture ?? undefined,
                role: m.role as UserRole,
                status: 'active' as const,
                joinedAt: String(m.createdAt),
                lastActiveAt: undefined,
                integrationIds: [],
            }));

            invitations.value = apiInvitations
                .filter((inv) => inv.status !== 'accepted')
                .map((inv) => ({
                    id: inv.id,
                    email: inv.email ?? undefined,
                    role: inv.role as UserRole,
                    integrationIds: [],
                    invitedBy: inv.invitedByUser?.name ?? 'Unknown',
                    invitedAt: String(inv.createdAt),
                    expiresAt: String(inv.expiresAt),
                    status: inv.status as Invitation['status'],
                    inviteLink: inv.inviteToken ? `${APP_ORIGIN}/invite/${inv.inviteToken}` : undefined,
                }));
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Failed to load data';
        } finally {
            loading.value = false;
        }
    }

    onMounted(loadData);

    const filteredMembers = computed(() => {
        if (!search.value) return members.value;
        const q = search.value.toLowerCase();
        return members.value.filter((m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
    });

    const filteredInvitations = computed(() => {
        if (!search.value) return invitations.value;
        const q = search.value.toLowerCase();
        return invitations.value.filter(
            (i) => i.email?.toLowerCase().includes(q) || i.invitedBy.toLowerCase().includes(q) || (!i.email && 'link-only invitation'.includes(q)),
        );
    });

    const pendingCount = computed(() => invitations.value.filter((i) => i.status === 'pending').length);

    async function handleChangeRole(userId: string, newRole: UserRole) {
        try {
            await changeRole(integrationId.value, parseInt(userId, 10), newRole);
            const member = members.value.find((m) => m.id === userId);
            if (member) member.role = newRole;
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Failed to change role';
        }
    }

    function handleRemoveUser(userId: string) {
        confirmRemoveUserId.value = userId;
    }

    async function confirmRemoveUser() {
        if (confirmRemoveUserId.value) {
            try {
                await apiRemoveMember(integrationId.value, parseInt(confirmRemoveUserId.value, 10));
                members.value = members.value.filter((m) => m.id !== confirmRemoveUserId.value);
            } catch (e) {
                error.value = e instanceof Error ? e.message : 'Failed to remove member';
            }
        }
        confirmRemoveUserId.value = null;
    }

    async function handleResend(invitationId: string) {
        try {
            await apiResendInvitation(integrationId.value, invitationId);
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Failed to resend invitation';
        }
    }

    function handleRevoke(invitationId: string) {
        confirmRevokeInvitationId.value = invitationId;
    }

    async function confirmRevokeInvitation() {
        if (confirmRevokeInvitationId.value) {
            try {
                await apiRevokeInvitation(integrationId.value, confirmRevokeInvitationId.value);
                invitations.value = invitations.value.filter((i) => i.id !== confirmRevokeInvitationId.value);
            } catch (e) {
                error.value = e instanceof Error ? e.message : 'Failed to revoke invitation';
            }
        }
        confirmRevokeInvitationId.value = null;
    }

    async function handleCopyLink(link: string) {
        try {
            await navigator.clipboard.writeText(link);
            copiedLink.value = true;
            setTimeout(() => (copiedLink.value = false), 2000);
        } catch {
            // Fallback: no feedback if clipboard fails
        }
    }

    async function handleInvite(data: UserInviteFormData) {
        try {
            const invitation = await createInvitation(integrationId.value, {
                email: data.email,
                role: data.role,
                sendEmail: data.sendEmail,
            });

            invitations.value.push({
                id: invitation.id,
                email: invitation.email ?? undefined,
                role: invitation.role as UserRole,
                integrationIds: [],
                invitedBy: invitation.invitedByUser?.name ?? 'You',
                invitedAt: String(invitation.createdAt),
                expiresAt: String(invitation.expiresAt),
                status: invitation.status as Invitation['status'],
                inviteLink: `${APP_ORIGIN}/invite/${invitation.inviteToken}`,
            });
            showInviteDialog.value = false;
        } catch (e) {
            showInviteDialog.value = false;
            error.value = e instanceof Error ? e.message : 'Failed to create invitation';
        }
    }
</script>

<template>
    <div class="space-y-4 p-4">
        <!-- Header with back navigation -->
        <PageHeader
            title="Manage Users"
            :description="integrationLabel || `Integration ${integrationId}`"
            :icon="Users"
        >
            <template #left>
                <Button
                    variant="ghost"
                    size="sm"
                    class="h-8 w-8 p-0 mr-1"
                    aria-label="Back to integrations"
                    @click="router.push({name: 'integrations'})"
                >
                    <ArrowLeft class="h-4 w-4" />
                </Button>
            </template>
            <Button
                v-if="canManageMembers"
                size="sm"
                @click="showInviteDialog = true"
            >
                <UserPlus class="h-4 w-4" />
                Invite Member
            </Button>
        </PageHeader>

        <!-- Error Banner -->
        <div
            v-if="error"
            class="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
            {{ error }}
        </div>

        <!-- Loading State -->
        <div
            v-if="loading"
            class="flex items-center justify-center py-12"
        >
            <Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
        </div>

        <template v-else>
            <!-- Stats + Search -->
            <div class="flex flex-col sm:flex-row sm:items-center gap-3">
                <div class="flex items-center gap-4">
                    <div class="flex items-center gap-2 text-sm">
                        <Users class="h-4 w-4 text-muted-foreground" />
                        <span class="font-medium">{{ members.length }}</span>
                        <span class="text-muted-foreground">members</span>
                    </div>
                    <div class="flex items-center gap-2 text-sm">
                        <Clock class="h-4 w-4 text-muted-foreground" />
                        <span class="font-medium">{{ pendingCount }}</span>
                        <span class="text-muted-foreground">pending</span>
                    </div>
                </div>
                <div class="relative flex-1 max-w-sm sm:ml-auto">
                    <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        v-model="search"
                        placeholder="Search members..."
                        class="pl-9"
                    />
                </div>
            </div>

            <!-- Members -->
            <div class="space-y-2">
                <h3 class="text-sm font-medium text-muted-foreground">
                    Team Members
                    <Badge
                        variant="secondary"
                        class="ml-1.5"
                    >
                        {{ filteredMembers.length }}
                    </Badge>
                </h3>
                <div class="space-y-2">
                    <UserCard
                        v-for="member in filteredMembers"
                        :key="member.id"
                        :user="member"
                        :readonly="!canManageMembers"
                        :caller-role="userRole"
                        @change-role="handleChangeRole"
                        @remove="handleRemoveUser"
                    />
                </div>
                <EmptyState
                    v-if="filteredMembers.length === 0 && search"
                    :icon="Search"
                    message="No members match your search."
                />
            </div>

            <!-- Pending Invitations -->
            <div
                v-if="filteredInvitations.length > 0"
                class="space-y-2"
            >
                <h3 class="text-sm font-medium text-muted-foreground">
                    Pending Invitations
                    <Badge
                        variant="secondary"
                        class="ml-1.5"
                    >
                        {{ filteredInvitations.length }}
                    </Badge>
                </h3>
                <div class="space-y-2">
                    <PendingInvitationCard
                        v-for="invitation in filteredInvitations"
                        :key="invitation.id"
                        :invitation="invitation"
                        :readonly="!canManageMembers"
                        @resend="handleResend"
                        @revoke="handleRevoke"
                        @copy-link="handleCopyLink"
                    />
                </div>
            </div>
        </template>

        <!-- Invite Dialog -->
        <InviteUserDialog
            :open="showInviteDialog"
            @update:open="showInviteDialog = $event"
            @invite="handleInvite"
        />

        <!-- Remove User Confirmation -->
        <Dialog
            :open="!!confirmRemoveUserId"
            @update:open="confirmRemoveUserId = null"
        >
            <template #default="{close}">
                <h3 class="text-lg font-semibold">Remove User</h3>
                <p class="mt-2 text-sm text-muted-foreground">
                    Are you sure you want to remove this user from the integration? They will lose access immediately.
                </p>
                <div class="flex justify-end gap-2 mt-4">
                    <Button
                        variant="outline"
                        @click="close()"
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        @click="confirmRemoveUser()"
                    >
                        Remove User
                    </Button>
                </div>
            </template>
        </Dialog>

        <!-- Revoke Invitation Confirmation -->
        <Dialog
            :open="!!confirmRevokeInvitationId"
            @update:open="confirmRevokeInvitationId = null"
        >
            <template #default="{close}">
                <h3 class="text-lg font-semibold">Revoke Invitation</h3>
                <p class="mt-2 text-sm text-muted-foreground">
                    Are you sure you want to revoke this invitation? The invite link will no longer be valid.
                </p>
                <div class="flex justify-end gap-2 mt-4">
                    <Button
                        variant="outline"
                        @click="close()"
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        @click="confirmRevokeInvitation()"
                    >
                        Revoke Invitation
                    </Button>
                </div>
            </template>
        </Dialog>

        <!-- Copy feedback -->
        <Transition name="fade">
            <div
                v-if="copiedLink"
                class="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg"
            >
                Copied to clipboard
            </div>
        </Transition>
    </div>
</template>

<style scoped>
    .fade-enter-active,
    .fade-leave-active {
        transition: opacity 0.2s ease;
    }

    .fade-enter-from,
    .fade-leave-to {
        opacity: 0;
    }
</style>
