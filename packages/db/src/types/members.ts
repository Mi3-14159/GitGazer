import type * as schema from '../schema';
import type {IntegrationInvitationSelect} from './entities';

export const WEBSOCKET_CHANNELS = ['workflows', 'events_log'] as const;
export type WebSocketChannel = (typeof WEBSOCKET_CHANNELS)[number];

// Member / invitation management
export const MEMBER_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Lower rank = higher privilege. owner(0) > admin(1) > member(2) > viewer(3) */
export const ROLE_RANK: Record<MemberRole, number> = {
    owner: 0,
    admin: 1,
    member: 2,
    viewer: 3,
};

export const hasRole = (userRole: MemberRole, requiredRole: MemberRole): boolean => ROLE_RANK[userRole] <= ROLE_RANK[requiredRole];

export const isMemberRole = (value: string): value is MemberRole => (MEMBER_ROLES as readonly string[]).includes(value);

export const INVITATION_STATUSES = ['pending', 'accepted', 'expired'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export type IntegrationInvitationUser = Pick<typeof schema.users.$inferSelect, 'id' | 'name' | 'email' | 'picture'>;

export type IntegrationInvitation = Omit<IntegrationInvitationSelect, 'invitedBy' | 'inviteeId'> & {
    invitedByUser: IntegrationInvitationUser | null;
    invitee: IntegrationInvitationUser | null;
};

export type CreateInvitationInput = {
    email?: string;
    role: MemberRole;
    sendEmail: boolean;
};

export const GITHUB_ORG_ROLES = ['admin', 'member'] as const;
export type GithubOrgRole = (typeof GITHUB_ORG_ROLES)[number];

export const ORG_SYNC_DEFAULT_ROLES = ['viewer', 'member', 'admin'] as const;
export type OrgSyncDefaultRole = (typeof ORG_SYNC_DEFAULT_ROLES)[number];

export const isOrgSyncDefaultRole = (value: string): value is OrgSyncDefaultRole => (ORG_SYNC_DEFAULT_ROLES as readonly string[]).includes(value);

export const MEMBER_ASSIGNMENT_SOURCES = ['manual', 'org_sync'] as const;
export type MemberAssignmentSource = (typeof MEMBER_ASSIGNMENT_SOURCES)[number];
