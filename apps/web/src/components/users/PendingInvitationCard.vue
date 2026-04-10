<script setup lang="ts">
    import Badge from '@/components/ui/Badge.vue';
    import Button from '@/components/ui/Button.vue';
    import Card from '@/components/ui/Card.vue';
    import CardContent from '@/components/ui/CardContent.vue';
    import DropdownMenu from '@/components/ui/DropdownMenu.vue';
    import type {Invitation} from '@/types/user';
    import {formatCalendarDate} from '@/utils/formatDate';
    import {Eye, Link as LinkIcon, Mail, MoreHorizontal, RefreshCw, Shield, Trash2, UserCog} from 'lucide-vue-next';
    import {DropdownMenuItem, DropdownMenuSeparator} from 'radix-vue';
    import {computed, ref} from 'vue';

    const props = defineProps<{
        invitation: Invitation;
    }>();

    const emit = defineEmits<{
        resend: [invitationId: string];
        revoke: [invitationId: string];
        copyLink: [inviteLink: string];
    }>();

    const menuOpen = ref(false);
    const emailEnabled = import.meta.env.VITE_ENABLE_INVITATION_EMAIL === 'true';

    const roleBadgeVariant = computed(() => {
        switch (props.invitation.role) {
            case 'admin':
                return 'secondary' as const;
            default:
                return 'outline' as const;
        }
    });
</script>

<template>
    <Card>
        <CardContent class="p-4 pt-4">
            <div class="flex items-start justify-between gap-4">
                <div class="flex items-start gap-3 flex-1 min-w-0">
                    <div class="flex h-10 w-10 items-center justify-center rounded-full bg-muted flex-shrink-0">
                        <LinkIcon
                            v-if="!invitation.email"
                            class="h-4 w-4 text-muted-foreground"
                        />
                        <Mail
                            v-else
                            class="h-4 w-4 text-muted-foreground"
                        />
                    </div>
                    <div class="flex-1 min-w-0 space-y-2">
                        <div class="flex flex-col sm:flex-row sm:items-center gap-2">
                            <div class="flex-1 min-w-0">
                                <p class="font-medium truncate">{{ invitation.email || 'Link-only invitation' }}</p>
                                <p class="text-sm text-muted-foreground">Invited by {{ invitation.invitedBy }}</p>
                            </div>
                            <div class="flex items-center gap-2 flex-shrink-0">
                                <Badge
                                    :variant="roleBadgeVariant"
                                    class="gap-1 capitalize"
                                >
                                    <Shield
                                        v-if="invitation.role === 'admin'"
                                        class="h-3 w-3"
                                    />
                                    <UserCog
                                        v-else-if="invitation.role === 'member'"
                                        class="h-3 w-3"
                                    />
                                    <Eye
                                        v-else
                                        class="h-3 w-3"
                                    />
                                    {{ invitation.role }}
                                </Badge>
                                <Badge :variant="invitation.status === 'expired' ? 'destructive' : 'secondary'">
                                    {{ invitation.status }}
                                </Badge>
                            </div>
                        </div>
                        <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{{ invitation.email ? 'Sent' : 'Created' }} {{ formatCalendarDate(invitation.invitedAt) }}</span>
                            <span>&middot;</span>
                            <span>
                                {{ invitation.status === 'expired' ? 'Expired' : 'Expires' }}
                                {{ formatCalendarDate(invitation.expiresAt) }}
                            </span>
                        </div>
                    </div>
                </div>

                <DropdownMenu v-model:open="menuOpen">
                    <template #trigger>
                        <Button
                            variant="ghost"
                            size="sm"
                            class="h-8 w-8 p-0 flex-shrink-0"
                        >
                            <MoreHorizontal class="h-4 w-4" />
                        </Button>
                    </template>
                    <p class="px-2 py-1.5 text-sm font-semibold">Actions</p>
                    <DropdownMenuSeparator class="h-px bg-border my-1" />
                    <DropdownMenuItem
                        v-if="invitation.inviteLink"
                        class="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent outline-none"
                        @click="emit('copyLink', invitation.inviteLink)"
                    >
                        <LinkIcon class="h-4 w-4" />
                        Copy Invite Link
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        v-if="emailEnabled && invitation.email && invitation.status === 'pending'"
                        class="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent outline-none"
                        @click="emit('resend', invitation.id)"
                    >
                        <RefreshCw class="h-4 w-4" />
                        Resend Email
                    </DropdownMenuItem>
                    <DropdownMenuSeparator
                        v-if="invitation.status === 'pending'"
                        class="h-px bg-border my-1"
                    />
                    <DropdownMenuItem
                        v-if="invitation.status === 'pending'"
                        class="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent text-destructive outline-none"
                        @click="emit('revoke', invitation.id)"
                    >
                        <Trash2 class="h-4 w-4" />
                        Revoke Invitation
                    </DropdownMenuItem>
                </DropdownMenu>
            </div>
        </CardContent>
    </Card>
</template>
