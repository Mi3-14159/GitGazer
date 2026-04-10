<script setup lang="ts">
    import Badge from '@/components/ui/Badge.vue';
    import Button from '@/components/ui/Button.vue';
    import Card from '@/components/ui/Card.vue';
    import CardContent from '@/components/ui/CardContent.vue';
    import DropdownMenu from '@/components/ui/DropdownMenu.vue';
    import type {TeamMember, UserRole} from '@/types/user';
    import {formatCalendarDate, formatTimeSince} from '@/utils/formatDate';
    import {MEMBER_ROLES} from '@common/types';
    import {Crown, Eye, MoreHorizontal, Shield, Trash2, UserCog} from 'lucide-vue-next';
    import {DropdownMenuItem, DropdownMenuSeparator} from 'radix-vue';
    import {computed, ref} from 'vue';

    const props = defineProps<{
        user: TeamMember;
    }>();

    const emit = defineEmits<{
        changeRole: [userId: string, newRole: UserRole];
        remove: [userId: string];
    }>();

    const ASSIGNABLE_ROLES: {value: UserRole; label: string}[] = MEMBER_ROLES.map((r) => ({value: r, label: r.charAt(0).toUpperCase() + r.slice(1)}));

    const availableRoles = computed(() => ASSIGNABLE_ROLES.filter((r) => r.value !== props.user.role));

    const menuOpen = ref(false);

    const initials = computed(() =>
        props.user.name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2),
    );

    const roleBadgeVariant = computed(() => {
        switch (props.user.role) {
            case 'owner':
                return 'default' as const;
            case 'admin':
                return 'secondary' as const;
            default:
                return 'outline' as const;
        }
    });

    const statusBadgeVariant = computed(() => {
        switch (props.user.status) {
            case 'active':
                return 'success' as const;
            case 'invited':
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
                    <!-- Avatar -->
                    <div class="h-10 w-10 flex-shrink-0 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                        <img
                            v-if="user.avatar"
                            :src="user.avatar"
                            :alt="user.name"
                            class="h-full w-full object-cover"
                        />
                        <span
                            v-else
                            class="text-xs font-medium text-muted-foreground"
                        >
                            {{ initials }}
                        </span>
                    </div>

                    <div class="flex-1 min-w-0 space-y-2">
                        <div class="flex flex-col sm:flex-row sm:items-center gap-2">
                            <div class="flex-1 min-w-0">
                                <h4 class="font-medium truncate">{{ user.name }}</h4>
                                <p class="text-sm text-muted-foreground truncate">{{ user.email }}</p>
                            </div>
                            <div class="flex items-center gap-2 flex-shrink-0">
                                <Badge
                                    :variant="roleBadgeVariant"
                                    class="gap-1 capitalize"
                                >
                                    <Crown
                                        v-if="user.role === 'owner'"
                                        class="h-3 w-3"
                                    />
                                    <Shield
                                        v-else-if="user.role === 'admin'"
                                        class="h-3 w-3"
                                    />
                                    <UserCog
                                        v-else-if="user.role === 'member'"
                                        class="h-3 w-3"
                                    />
                                    <Eye
                                        v-else
                                        class="h-3 w-3"
                                    />
                                    {{ user.role }}
                                </Badge>
                                <Badge :variant="statusBadgeVariant">
                                    {{ user.status }}
                                </Badge>
                            </div>
                        </div>

                        <div class="flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-muted-foreground">
                            <template v-if="user.status === 'active'">
                                <span>Joined {{ formatCalendarDate(user.joinedAt) }}</span>
                                <span class="hidden sm:inline">&middot;</span>
                                <span>Last active {{ formatTimeSince(user.lastActiveAt) ?? 'Never' }}</span>
                            </template>
                            <template v-if="user.status === 'invited'">
                                <span>Invited {{ formatCalendarDate(user.invitedAt) }}</span>
                            </template>
                        </div>
                    </div>
                </div>

                <!-- Actions dropdown for non-owners -->
                <DropdownMenu
                    v-if="user.role !== 'owner'"
                    v-model:open="menuOpen"
                >
                    <template #trigger>
                        <Button
                            variant="ghost"
                            size="sm"
                            class="h-8 w-8 p-0 flex-shrink-0"
                        >
                            <MoreHorizontal class="h-4 w-4" />
                        </Button>
                    </template>
                    <p class="px-2 py-1.5 text-sm font-semibold">Change Role</p>
                    <DropdownMenuSeparator class="h-px bg-border my-1" />
                    <DropdownMenuItem
                        v-for="r in availableRoles"
                        :key="r.value"
                        class="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent outline-none"
                        @click="emit('changeRole', user.id, r.value)"
                    >
                        Change to {{ r.label }}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator class="h-px bg-border my-1" />
                    <DropdownMenuItem
                        class="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent text-destructive outline-none"
                        @click="emit('remove', user.id)"
                    >
                        <Trash2 class="h-4 w-4" />
                        Remove User
                    </DropdownMenuItem>
                </DropdownMenu>
            </div>
        </CardContent>
    </Card>
</template>
