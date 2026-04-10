export type UserRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface TeamMember {
    id: string;
    email: string;
    name: string;
    avatar?: string;
    role: UserRole;
    status: 'active' | 'invited' | 'inactive';
    invitedAt?: string;
    joinedAt?: string;
    lastActiveAt?: string;
    integrationIds: string[];
}

export interface Invitation {
    id: string;
    email?: string;
    role: UserRole;
    integrationIds: string[];
    invitedBy: string;
    invitedAt: string;
    expiresAt: string;
    status: 'pending' | 'accepted' | 'expired';
    inviteLink?: string;
}

export interface UserInviteFormData {
    email?: string;
    role: UserRole;
    integrationIds: string[];
    sendEmail: boolean;
}

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
    owner: 'The only role allowed to delete an integration.',
    admin: 'Full access to all features, except deleting an integration.',
    member: 'View and manage workflows and notifications.',
    viewer: 'View workflows. Cannot make any changes.',
};
