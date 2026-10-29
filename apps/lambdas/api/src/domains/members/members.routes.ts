import {addUserIntegrationsToCtx} from '@/domains/integrations/integrations.middleware';
import {
    acceptInvitation,
    changeRole,
    createInvitation,
    getInvitations,
    getMembers,
    leaveIntegration,
    removeMember,
    resendInvitation,
    revokeInvitation,
} from '@/domains/members/members.controller';
import type {AppEnv} from '@/shared/hono/env';
import {BadRequestError, HttpStatusCodes} from '@/shared/errors';
import {requireRole} from '@/shared/middleware/require-role';
import {isMemberRole} from '@gitgazer/db/types';
import {Hono} from 'hono';

const router = new Hono<AppEnv>();

router.get('/integrations/:integrationId/members', addUserIntegrationsToCtx, requireRole('viewer'), async (c) => {
    const integrationId = c.req.param('integrationId');
    // Only this integration, so the views mask by the caller's role here and not by roles elsewhere
    const members = await getMembers({integrationId, integrationRoles: {[integrationId]: c.var.appContext!.role!}});

    return new Response(JSON.stringify(members), {
        status: HttpStatusCodes.OK,
        headers: {'Content-Type': 'application/json'},
    });
});

router.patch('/integrations/:integrationId/members/:userId/role', addUserIntegrationsToCtx, requireRole('admin'), async (c) => {
    const integrationId = c.req.param('integrationId');
    const targetUserId = parseInt(c.req.param('userId'), 10);
    const integrationIds = c.var.appContext?.integrations ?? [];
    const requestingUserId = c.var.appContext!.userId;

    if (isNaN(targetUserId)) {
        throw new BadRequestError('Invalid user ID');
    }

    let body;
    try {
        body = await c.req.json();
    } catch {
        throw new BadRequestError('Invalid request body');
    }

    if (!body.role || !isMemberRole(body.role)) {
        throw new BadRequestError('Missing or invalid role');
    }

    await changeRole({
        integrationId,
        targetUserId,
        newRole: body.role,
        requestingUserId,
        requestingRole: c.var.appContext!.role!,
        integrationIds,
    });

    return new Response(null, {status: HttpStatusCodes.NO_CONTENT});
});

router.delete('/integrations/:integrationId/members/:userId', addUserIntegrationsToCtx, requireRole('admin'), async (c) => {
    const integrationId = c.req.param('integrationId');
    const targetUserId = parseInt(c.req.param('userId'), 10);
    const integrationIds = c.var.appContext?.integrations ?? [];
    const requestingUserId = c.var.appContext!.userId;

    if (isNaN(targetUserId)) {
        throw new BadRequestError('Invalid user ID');
    }

    await removeMember({
        integrationId,
        targetUserId,
        requestingUserId,
        requestingRole: c.var.appContext!.role!,
        integrationIds,
    });

    return new Response(null, {status: HttpStatusCodes.NO_CONTENT});
});

router.post('/integrations/:integrationId/leave', addUserIntegrationsToCtx, requireRole('viewer'), async (c) => {
    const integrationId = c.req.param('integrationId');
    const integrationIds = c.var.appContext?.integrations ?? [];
    const userId = c.var.appContext!.userId;

    await leaveIntegration({integrationId, userId, integrationIds});

    return new Response(null, {status: HttpStatusCodes.NO_CONTENT});
});

router.get('/integrations/:integrationId/invitations', addUserIntegrationsToCtx, requireRole('member'), async (c) => {
    const integrationId = c.req.param('integrationId');
    // integration_invitations_view and users_view mask invite tokens and emails below admin in this integration
    const invitations = await getInvitations({integrationId, integrationRoles: {[integrationId]: c.var.appContext!.role!}});

    return new Response(JSON.stringify(invitations), {
        status: HttpStatusCodes.OK,
        headers: {'Content-Type': 'application/json'},
    });
});

router.post('/integrations/:integrationId/invitations', addUserIntegrationsToCtx, requireRole('admin'), async (c) => {
    const integrationId = c.req.param('integrationId');
    const integrationIds = c.var.appContext?.integrations ?? [];
    const requestingUserId = c.var.appContext!.userId;

    let body;
    try {
        body = await c.req.json();
    } catch {
        throw new BadRequestError('Invalid request body');
    }

    if (body.email !== undefined && typeof body.email !== 'string') {
        throw new BadRequestError('Invalid email');
    }

    if (!body.role || !isMemberRole(body.role)) {
        throw new BadRequestError('Missing or invalid role');
    }

    const invitation = await createInvitation({
        integrationId,
        input: {
            email: body.email || undefined,
            role: body.role,
            sendEmail: body.sendEmail === true,
        },
        requestingUserId,
        integrationIds,
    });

    return new Response(JSON.stringify(invitation), {
        status: HttpStatusCodes.CREATED,
        headers: {'Content-Type': 'application/json'},
    });
});

router.post('/integrations/:integrationId/invitations/:invitationId/resend', addUserIntegrationsToCtx, requireRole('admin'), async (c) => {
    const integrationId = c.req.param('integrationId');
    const invitationId = c.req.param('invitationId');
    const integrationIds = c.var.appContext?.integrations ?? [];

    await resendInvitation({
        integrationId,
        invitationId,
        resendingUserId: c.var.appContext!.userId,
        integrationIds,
    });

    return new Response(null, {status: HttpStatusCodes.NO_CONTENT});
});

router.delete('/integrations/:integrationId/invitations/:invitationId', addUserIntegrationsToCtx, requireRole('admin'), async (c) => {
    const integrationId = c.req.param('integrationId');
    const invitationId = c.req.param('invitationId');
    const integrationIds = c.var.appContext?.integrations ?? [];

    await revokeInvitation({
        integrationId,
        invitationId,
        integrationIds,
    });

    return new Response(null, {status: HttpStatusCodes.NO_CONTENT});
});

// No addUserIntegrationsToCtx — the user doesn't belong to any integration yet.
// Global authenticate middleware still runs, so appContext is populated.
router.post('/invitations/accept', async (c) => {
    const userId = c.var.appContext?.userId;

    if (!userId) {
        throw new BadRequestError('Authentication required');
    }

    let body;
    try {
        body = await c.req.json();
    } catch {
        throw new BadRequestError('Invalid request body');
    }

    if (!body.inviteToken || typeof body.inviteToken !== 'string') {
        throw new BadRequestError('Missing or invalid invite token');
    }

    await acceptInvitation({
        inviteToken: body.inviteToken,
        acceptingUserId: userId,
    });

    return new Response(null, {status: HttpStatusCodes.NO_CONTENT});
});

export default router;
