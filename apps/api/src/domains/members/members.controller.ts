import {sendInvitationEmail} from '@/shared/clients/ses.client';
import config from '@/shared/config';
import {getLogger} from '@/shared/logger';
import {BadRequestError, ForbiddenError, NotFoundError} from '@aws-lambda-powertools/event-handler/http';
import {db, RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {invitationQueryRelations, memberQueryRelations} from '@gitgazer/db/queries';
import {gitgazerWriter} from '@gitgazer/db/schema/app';
import {integrationInvitations, users} from '@gitgazer/db/schema/gitgazer';
import {integrations, userAssignments} from '@gitgazer/db/schema/github/workflows';
import {MEMBER_ROLES, type CreateInvitationInput, type IntegrationInvitation, type IntegrationMember, type MemberRole} from '@gitgazer/db/types';
import {and, eq, gt} from 'drizzle-orm';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const getMembers = async (params: {integrationId: string; integrationIds: string[]}): Promise<IntegrationMember[]> => {
    const logger = getLogger();
    const {integrationId, integrationIds} = params;

    if (!integrationIds.includes(integrationId)) {
        throw new ForbiddenError('Integration not accessible');
    }

    logger.info(`Getting members for integration ${integrationId}`);

    const results = await withRlsTransaction({
        integrationIds,
        callback: async (tx: RdsTransaction) => {
            return await tx.query.userAssignments.findMany({
                where: eq(userAssignments.integrationId, integrationId),
                with: memberQueryRelations,
            });
        },
    });

    return results;
};

export const changeRole = async (params: {
    integrationId: string;
    targetUserId: number;
    newRole: MemberRole;
    requestingUserId: number;
    requestingRole: MemberRole;
    integrationIds: string[];
}): Promise<void> => {
    const logger = getLogger();
    const {integrationId, targetUserId, newRole, requestingUserId, requestingRole, integrationIds} = params;

    if (!MEMBER_ROLES.includes(newRole)) {
        throw new BadRequestError(`Invalid role: ${newRole}`);
    }

    // Prevent changing own role
    if (targetUserId === requestingUserId) {
        throw new BadRequestError('Cannot change your own role');
    }

    // Only owners can assign the owner role
    if (newRole === 'owner' && requestingRole !== 'owner') {
        logger.info('authz', {
            userId: requestingUserId,
            integrationId,
            role: requestingRole,
            action: 'changeRole',
            allowed: false,
            reason: 'only owners can assign owner role',
            targetUserId,
            newRole,
        });
        throw new ForbiddenError('Only owners can assign the owner role');
    }

    logger.info(`Changing role for user ${targetUserId} in integration ${integrationId} to ${newRole}`);

    const updated = await withRlsTransaction({
        integrationIds,
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            // Fetch target's current role for fine-grained checks
            const [target] = await tx
                .select({role: userAssignments.role})
                .from(userAssignments)
                .where(and(eq(userAssignments.integrationId, integrationId), eq(userAssignments.userId, targetUserId)));

            if (!target) {
                throw new NotFoundError('User not found in this integration');
            }

            // Only owners can manage other owners/admins
            if ((target.role === 'owner' || target.role === 'admin') && requestingRole !== 'owner') {
                logger.info('authz', {
                    userId: requestingUserId,
                    integrationId,
                    role: requestingRole,
                    action: 'changeRole',
                    allowed: false,
                    reason: 'only owners can manage owners/admins',
                    targetUserId,
                    targetRole: target.role,
                });
                throw new ForbiddenError('Cannot change the role of an owner or admin');
            }

            return await tx
                .update(userAssignments)
                .set({role: newRole})
                .where(and(eq(userAssignments.integrationId, integrationId), eq(userAssignments.userId, targetUserId)))
                .returning();
        },
    });

    if (updated.length === 0) {
        throw new NotFoundError('User not found in this integration');
    }
};

export const removeMember = async (params: {
    integrationId: string;
    targetUserId: number;
    requestingUserId: number;
    requestingRole: MemberRole;
    integrationIds: string[];
}): Promise<void> => {
    const logger = getLogger();
    const {integrationId, targetUserId, requestingUserId, requestingRole, integrationIds} = params;

    if (targetUserId === requestingUserId) {
        throw new BadRequestError('Cannot remove yourself from an integration');
    }

    logger.info(`Removing user ${targetUserId} from integration ${integrationId}`);

    await withRlsTransaction({
        integrationIds,
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            // Fetch target's current role
            const [target] = await tx
                .select({role: userAssignments.role})
                .from(userAssignments)
                .where(and(eq(userAssignments.integrationId, integrationId), eq(userAssignments.userId, targetUserId)));

            if (!target) {
                throw new NotFoundError('User not found in this integration');
            }

            if (target.role === 'owner') {
                logger.info('authz', {
                    userId: requestingUserId,
                    integrationId,
                    role: requestingRole,
                    action: 'removeMember',
                    allowed: false,
                    reason: 'cannot remove owner',
                    targetUserId,
                });
                throw new ForbiddenError('Cannot remove an owner from the integration');
            }

            // Only owners can remove admins
            if (target.role === 'admin' && requestingRole !== 'owner') {
                logger.info('authz', {
                    userId: requestingUserId,
                    integrationId,
                    role: requestingRole,
                    action: 'removeMember',
                    allowed: false,
                    reason: 'only owners can remove admins',
                    targetUserId,
                });
                throw new ForbiddenError('Only owners can remove admins');
            }

            await tx.delete(userAssignments).where(and(eq(userAssignments.integrationId, integrationId), eq(userAssignments.userId, targetUserId)));
        },
    });
};

export const leaveIntegration = async (params: {integrationId: string; userId: number; integrationIds: string[]}): Promise<void> => {
    const logger = getLogger();
    const {integrationId, userId, integrationIds} = params;

    if (!integrationIds.includes(integrationId)) {
        throw new ForbiddenError('Integration not accessible');
    }

    logger.info(`User ${userId} is leaving integration ${integrationId}`);

    await withRlsTransaction({
        integrationIds,
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            const [member] = await tx
                .select({role: userAssignments.role})
                .from(userAssignments)
                .where(and(eq(userAssignments.integrationId, integrationId), eq(userAssignments.userId, userId)));

            if (!member) {
                throw new NotFoundError('You are not a member of this integration');
            }

            if (member.role === 'owner') {
                logger.info('authz', {
                    userId,
                    integrationId,
                    role: 'owner',
                    action: 'leaveIntegration',
                    allowed: false,
                    reason: 'owner cannot leave',
                });
                throw new ForbiddenError('The owner cannot leave the integration. Transfer ownership first.');
            }

            await tx.delete(userAssignments).where(and(eq(userAssignments.integrationId, integrationId), eq(userAssignments.userId, userId)));
        },
    });
};

export const getInvitations = async (params: {integrationId: string; integrationIds: string[]}): Promise<IntegrationInvitation[]> => {
    const logger = getLogger();
    const {integrationId, integrationIds} = params;

    if (!integrationIds.includes(integrationId)) {
        throw new ForbiddenError('Integration not accessible');
    }

    logger.info(`Getting invitations for integration ${integrationId}`);

    const results = await withRlsTransaction({
        integrationIds,
        callback: async (tx: RdsTransaction) => {
            return await tx.query.integrationInvitations.findMany({
                where: eq(integrationInvitations.integrationId, integrationId),
                with: invitationQueryRelations,
            });
        },
    });

    return results;
};

export const createInvitation = async (params: {
    integrationId: string;
    input: CreateInvitationInput;
    requestingUserId: number;
    integrationIds: string[];
}): Promise<IntegrationInvitation> => {
    const logger = getLogger();
    const {integrationId, input, requestingUserId, integrationIds} = params;

    if (!MEMBER_ROLES.includes(input.role)) {
        throw new BadRequestError(`Invalid role: ${input.role}`);
    }

    if (input.role === 'owner') {
        throw new BadRequestError('Cannot create an invitation with the owner role');
    }

    if (input.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(input.email)) {
            throw new BadRequestError('Invalid email address');
        }
    }

    if (input.sendEmail && !input.email) {
        throw new BadRequestError('Email is required when sending an invitation email');
    }

    logger.info(`Creating invitation to integration ${integrationId}`);

    const result = await withRlsTransaction({
        integrationIds,
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            const normalizedEmail = input.email?.toLowerCase() ?? null;

            // Check for existing pending invitation for this email (only if email provided)
            if (normalizedEmail) {
                const [existing] = await tx
                    .select({id: integrationInvitations.id})
                    .from(integrationInvitations)
                    .where(
                        and(
                            eq(integrationInvitations.integrationId, integrationId),
                            eq(integrationInvitations.email, normalizedEmail),
                            eq(integrationInvitations.status, 'pending'),
                        ),
                    );

                if (existing) {
                    throw new BadRequestError('An invitation for this email already exists');
                }

                // Check if user is already a member
                const existingMember = await tx
                    .select({userId: userAssignments.userId})
                    .from(userAssignments)
                    .innerJoin(users, eq(userAssignments.userId, users.id))
                    .where(and(eq(userAssignments.integrationId, integrationId), eq(users.email, normalizedEmail)));

                if (existingMember.length > 0) {
                    throw new BadRequestError('User is already a member of this integration');
                }
            }

            const expiresAt = new Date(Date.now() + SEVEN_DAYS_MS);

            const [invitation] = await tx
                .insert(integrationInvitations)
                .values({
                    integrationId,
                    email: normalizedEmail,
                    role: input.role,
                    invitedBy: requestingUserId,
                    expiresAt,
                })
                .returning();

            // Get inviter details for response
            const [inviter] = await tx
                .select({id: users.id, name: users.name, email: users.email, picture: users.picture})
                .from(users)
                .where(eq(users.id, requestingUserId));

            // Get integration label for email
            const [integration] = await tx
                .select({label: integrations.label})
                .from(integrations)
                .where(eq(integrations.integrationId, integrationId));

            return {
                invitation,
                inviter: inviter ?? null,
                integrationLabel: integration?.label ?? 'Unknown',
            };
        },
    });

    if (input.sendEmail && input.email && config.get('sesConfig').emailEnabled) {
        await sendInvitationEmail({
            recipientEmail: input.email.toLowerCase(),
            inviterName: result.inviter?.name ?? 'A team member',
            integrationLabel: result.integrationLabel,
            role: input.role,
            inviteToken: result.invitation.inviteToken,
        }).catch((err) => {
            logger.error('Failed to send invitation email', {error: err, email: input.email});
        });
    }

    return {
        ...result.invitation,
        invitedByUser: result.inviter,
        invitee: null,
    };
};

export const revokeInvitation = async (params: {integrationId: string; invitationId: string; integrationIds: string[]}): Promise<void> => {
    const logger = getLogger();
    const {integrationId, invitationId, integrationIds} = params;

    logger.info(`Revoking invitation ${invitationId} from integration ${integrationId}`);

    const deleted = await withRlsTransaction({
        integrationIds,
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            return await tx
                .delete(integrationInvitations)
                .where(
                    and(
                        eq(integrationInvitations.integrationId, integrationId),
                        eq(integrationInvitations.id, invitationId),
                        eq(integrationInvitations.status, 'pending'),
                    ),
                )
                .returning();
        },
    });

    if (deleted.length === 0) {
        throw new NotFoundError('Invitation not found');
    }
};

export const resendInvitation = async (params: {
    integrationId: string;
    invitationId: string;
    resendingUserId: number;
    integrationIds: string[];
}): Promise<void> => {
    const logger = getLogger();
    const {integrationId, invitationId, resendingUserId, integrationIds} = params;

    if (!config.get('sesConfig').emailEnabled) {
        throw new BadRequestError('Email sending is not enabled');
    }

    logger.info(`Resending invitation ${invitationId} from integration ${integrationId}`);

    const resendResult = await withRlsTransaction({
        integrationIds,
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            // Fetch the invitation first to validate before modifying
            const [inv] = await tx
                .select()
                .from(integrationInvitations)
                .where(
                    and(
                        eq(integrationInvitations.integrationId, integrationId),
                        eq(integrationInvitations.id, invitationId),
                        eq(integrationInvitations.status, 'pending'),
                    ),
                );

            if (!inv) {
                throw new NotFoundError('Invitation not found or is not pending');
            }

            if (!inv.email) {
                throw new BadRequestError('This invitation has no email address — share the invite link instead');
            }

            // Extend expiry only after validation
            const newExpiresAt = new Date(Date.now() + SEVEN_DAYS_MS);

            await tx.update(integrationInvitations).set({expiresAt: newExpiresAt}).where(eq(integrationInvitations.id, invitationId));

            // Use the resending admin's name (not the original inviter) for the email
            const [resender] = await tx.select({name: users.name}).from(users).where(eq(users.id, resendingUserId));

            const [integration] = await tx
                .select({label: integrations.label})
                .from(integrations)
                .where(eq(integrations.integrationId, integrationId));

            return {
                email: inv.email,
                role: inv.role,
                inviteToken: inv.inviteToken,
                senderName: resender?.name ?? 'A team member',
                integrationLabel: integration?.label ?? 'Unknown',
            };
        },
    });

    await sendInvitationEmail({
        recipientEmail: resendResult.email,
        inviterName: resendResult.senderName,
        integrationLabel: resendResult.integrationLabel,
        role: resendResult.role,
        inviteToken: resendResult.inviteToken,
    }).catch((err) => {
        logger.error('Failed to send invitation email on resend', {error: err, invitationId});
    });
};

export const acceptInvitation = async (params: {inviteToken: string; acceptingUserId: number}): Promise<void> => {
    const logger = getLogger();
    const {inviteToken, acceptingUserId} = params;

    logger.info(`Accepting invitation with token for user ${acceptingUserId}`);

    // The transaction ensures that we atomically check the invitation, claim it,
    // and add the user to the integration, preventing race conditions
    await db.transaction(async (tx) => {
        // Fetch the pending, non-expired invitation without mutating.
        const [invitation] = await tx
            .select()
            .from(integrationInvitations)
            .where(
                and(
                    eq(integrationInvitations.inviteToken, inviteToken),
                    eq(integrationInvitations.status, 'pending'),
                    gt(integrationInvitations.expiresAt, new Date()),
                ),
            );

        if (!invitation) {
            throw new NotFoundError('Invitation not found or cannot be accepted');
        }

        // Check if user is already a member before claiming the invitation
        const [existingMember] = await tx
            .select({userId: userAssignments.userId})
            .from(userAssignments)
            .where(and(eq(userAssignments.integrationId, invitation.integrationId), eq(userAssignments.userId, acceptingUserId)));

        if (existingMember) {
            throw new BadRequestError('You are already a member of this integration');
        }

        // Claim the invitation only after validation passes
        const [claimed] = await tx
            .update(integrationInvitations)
            .set({status: 'accepted', inviteeId: acceptingUserId})
            .where(
                and(
                    eq(integrationInvitations.id, invitation.id),
                    eq(integrationInvitations.integrationId, invitation.integrationId),
                    eq(integrationInvitations.status, 'pending'),
                ),
            )
            .returning();

        if (!claimed) {
            throw new NotFoundError('Invitation not found or cannot be accepted');
        }

        await tx.insert(userAssignments).values({
            integrationId: invitation.integrationId,
            userId: acceptingUserId,
            role: invitation.role,
        });
    });
};
