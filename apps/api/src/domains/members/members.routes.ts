import {addUserIntegrationsToCtx} from '@/domains/integrations/integrations.middleware';
import {
    acceptInvitation,
    changeRole,
    createInvitation,
    getInvitations,
    getMembers,
    removeMember,
    resendInvitation,
    revokeInvitation,
} from '@/domains/members/members.controller';
import {AppRequestContext} from '@/shared/types';
import {BadRequestError, HttpStatusCodes, Router} from '@aws-lambda-powertools/event-handler/http';
import type {MemberRole} from '@gitgazer/db/types';

const router = new Router();

router.get('/api/integrations/:integrationId/members', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const integrationId = reqCtx.params.integrationId;
    const integrationIds = reqCtx.appContext?.integrations ?? [];

    const members = await getMembers({integrationId, integrationIds});

    return new Response(JSON.stringify(members), {
        status: HttpStatusCodes.OK,
        headers: {'Content-Type': 'application/json'},
    });
});

router.patch('/api/integrations/:integrationId/members/:userId/role', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const integrationId = reqCtx.params.integrationId;
    const targetUserId = parseInt(reqCtx.params.userId, 10);
    const integrationIds = reqCtx.appContext?.integrations ?? [];
    const requestingUserId = reqCtx.appContext?.userId!;

    if (isNaN(targetUserId)) {
        throw new BadRequestError('Invalid user ID');
    }

    let body;
    try {
        body = await reqCtx.req.json();
    } catch {
        throw new BadRequestError('Invalid request body');
    }

    if (!body.role || typeof body.role !== 'string') {
        throw new BadRequestError('Missing or invalid role');
    }

    await changeRole({
        integrationId,
        targetUserId,
        newRole: body.role as MemberRole,
        requestingUserId,
        integrationIds,
    });

    return new Response(null, {status: HttpStatusCodes.NO_CONTENT});
});

router.delete('/api/integrations/:integrationId/members/:userId', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const integrationId = reqCtx.params.integrationId;
    const targetUserId = parseInt(reqCtx.params.userId, 10);
    const integrationIds = reqCtx.appContext?.integrations ?? [];
    const requestingUserId = reqCtx.appContext?.userId!;

    if (isNaN(targetUserId)) {
        throw new BadRequestError('Invalid user ID');
    }

    await removeMember({
        integrationId,
        targetUserId,
        requestingUserId,
        integrationIds,
    });

    return new Response(null, {status: HttpStatusCodes.NO_CONTENT});
});

router.get('/api/integrations/:integrationId/invitations', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const integrationId = reqCtx.params.integrationId;
    const integrationIds = reqCtx.appContext?.integrations ?? [];

    const invitations = await getInvitations({integrationId, integrationIds});

    const sanitized = invitations.map(({inviteToken: _token, ...rest}) => rest);

    return new Response(JSON.stringify(sanitized), {
        status: HttpStatusCodes.OK,
        headers: {'Content-Type': 'application/json'},
    });
});

router.post('/api/integrations/:integrationId/invitations', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const integrationId = reqCtx.params.integrationId;
    const integrationIds = reqCtx.appContext?.integrations ?? [];
    const requestingUserId = reqCtx.appContext?.userId!;

    let body;
    try {
        body = await reqCtx.req.json();
    } catch {
        throw new BadRequestError('Invalid request body');
    }

    if (body.email !== undefined && typeof body.email !== 'string') {
        throw new BadRequestError('Invalid email');
    }

    if (!body.role || typeof body.role !== 'string') {
        throw new BadRequestError('Missing or invalid role');
    }

    const invitation = await createInvitation({
        integrationId,
        input: {
            email: body.email || undefined,
            role: body.role as MemberRole,
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

router.post('/api/integrations/:integrationId/invitations/:invitationId/resend', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const integrationId = reqCtx.params.integrationId;
    const invitationId = reqCtx.params.invitationId;
    const integrationIds = reqCtx.appContext?.integrations ?? [];
    const requestingUserId = reqCtx.appContext?.userId!;

    await resendInvitation({
        integrationId,
        invitationId,
        requestingUserId,
        integrationIds,
    });

    return new Response(null, {status: HttpStatusCodes.NO_CONTENT});
});

router.delete('/api/integrations/:integrationId/invitations/:invitationId', [addUserIntegrationsToCtx], async (reqCtx: AppRequestContext) => {
    const integrationId = reqCtx.params.integrationId;
    const invitationId = reqCtx.params.invitationId;
    const integrationIds = reqCtx.appContext?.integrations ?? [];
    const requestingUserId = reqCtx.appContext?.userId!;

    await revokeInvitation({
        integrationId,
        invitationId,
        requestingUserId,
        integrationIds,
    });

    return new Response(null, {status: HttpStatusCodes.NO_CONTENT});
});

// No addUserIntegrationsToCtx — the user doesn't belong to any integration yet.
// Global authenticate middleware still runs, so appContext is populated.
router.post('/api/invitations/accept', async (reqCtx: AppRequestContext) => {
    const userId = reqCtx.appContext?.userId;

    if (!userId) {
        throw new BadRequestError('Authentication required');
    }

    let body;
    try {
        body = await reqCtx.req.json();
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
