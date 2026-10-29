import {Hono} from 'hono';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import router from '@/domains/members/members.routes';
import type {AppEnv} from '@/shared/hono/env';
import {testRequest} from '@/shared/hono/test-request';

const app = new Hono<AppEnv>().route('/api', router);

const mocks = vi.hoisted(() => ({
    acceptInvitation: vi.fn(),
    changeRole: vi.fn(),
    createInvitation: vi.fn(),
    getInvitations: vi.fn(),
    getMembers: vi.fn(),
    leaveIntegration: vi.fn(),
    removeMember: vi.fn(),
    resendInvitation: vi.fn(),
    revokeInvitation: vi.fn(),
    role: 'admin',
}));

vi.mock('@/domains/members/members.controller', () => mocks);
vi.mock('@/domains/integrations/integrations.middleware', () => ({
    addUserIntegrationsToCtx: async (
        c: {var: {appContext?: {integrations?: string[]; integrationRoles?: Record<string, string>}}},
        next: () => Promise<void>,
    ) => {
        c.var.appContext!.integrations = ['int-1'];
        c.var.appContext!.integrationRoles = {'int-1': mocks.role};
        await next();
    },
}));

const appContext = () => ({userId: 7, username: '', email: '', name: '', nickname: '', picture: ''});
const base = '/api/integrations/int-1';

describe('members routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.role = 'admin';
    });

    it('GET members returns the members', async () => {
        mocks.getMembers.mockResolvedValue([{userId: 1}]);

        const res = await testRequest(app, 'GET', `${base}/members`, {appContext: appContext()});

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual([{userId: 1}]);
        expect(mocks.getMembers).toHaveBeenCalledWith({integrationId: 'int-1', integrationRoles: {'int-1': 'admin'}});
    });

    // The emails are masked by gitgazer.users_view (proven in packages/db configuration-views.test.ts), not here.
    it.each(['viewer', 'member', 'admin', 'owner'])('GET members as %s passes the caller roles and returns the result as is', async (role) => {
        mocks.role = role;
        const members = [{userId: 1, user: {id: 1, email: role === 'viewer' ? null : 'a@example.com'}}];
        mocks.getMembers.mockResolvedValue(members);

        const res = await testRequest(app, 'GET', `${base}/members`, {appContext: appContext()});

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual(members);
        expect(mocks.getMembers).toHaveBeenCalledWith({integrationId: 'int-1', integrationRoles: {'int-1': role}});
    });

    it('GET members is forbidden for a non-member integration', async () => {
        const res = await testRequest(app, 'GET', '/api/integrations/other/members', {appContext: appContext()});

        expect(res.status).toBe(403);
    });

    it('PATCH role changes the role and answers 204', async () => {
        const res = await testRequest(app, 'PATCH', `${base}/members/5/role`, {appContext: appContext(), body: {role: 'member'}});

        expect(res.status).toBe(204);
        expect(mocks.changeRole).toHaveBeenCalledWith({
            integrationId: 'int-1',
            targetUserId: 5,
            newRole: 'member',
            requestingUserId: 7,
            requestingRole: 'admin',
            integrationIds: ['int-1'],
        });
    });

    it('PATCH role rejects an invalid user id, a malformed body and an invalid role', async () => {
        const badId = await testRequest(app, 'PATCH', `${base}/members/x/role`, {appContext: appContext(), body: {role: 'member'}});
        const malformed = await testRequest(app, 'PATCH', `${base}/members/5/role`, {appContext: appContext(), body: '{nope'});
        const badRole = await testRequest(app, 'PATCH', `${base}/members/5/role`, {appContext: appContext(), body: {role: 'root'}});

        expect(badId.status).toBe(400);
        expect((await badId.json()).message).toBe('Invalid user ID');
        expect(malformed.status).toBe(400);
        expect((await malformed.json()).message).toBe('Invalid request body');
        expect(badRole.status).toBe(400);
        expect((await badRole.json()).message).toBe('Missing or invalid role');
        expect(mocks.changeRole).not.toHaveBeenCalled();
    });

    it('PATCH role is forbidden below admin', async () => {
        mocks.role = 'member';

        const res = await testRequest(app, 'PATCH', `${base}/members/5/role`, {appContext: appContext(), body: {role: 'member'}});

        expect(res.status).toBe(403);
    });

    it('DELETE member removes the member and answers 204', async () => {
        const res = await testRequest(app, 'DELETE', `${base}/members/5`, {appContext: appContext()});

        expect(res.status).toBe(204);
        expect(mocks.removeMember).toHaveBeenCalledWith({
            integrationId: 'int-1',
            targetUserId: 5,
            requestingUserId: 7,
            requestingRole: 'admin',
            integrationIds: ['int-1'],
        });
    });

    it('DELETE member rejects an invalid user id', async () => {
        const res = await testRequest(app, 'DELETE', `${base}/members/x`, {appContext: appContext()});

        expect(res.status).toBe(400);
    });

    it('POST leave lets a viewer leave and answers 204', async () => {
        mocks.role = 'viewer';

        const res = await testRequest(app, 'POST', `${base}/leave`, {appContext: appContext()});

        expect(res.status).toBe(204);
        expect(mocks.leaveIntegration).toHaveBeenCalledWith({integrationId: 'int-1', userId: 7, integrationIds: ['int-1']});
    });

    // Tokens and emails are masked by gitgazer.integration_invitations_view and gitgazer.users_view, not here.
    it.each(['member', 'admin', 'owner'])('GET invitations as %s passes the caller roles and returns the result as is', async (role) => {
        mocks.role = role;
        const invitations = [{id: 'i1', email: 'a@example.com', invitedByUser: {name: 'Ada', email: 'ada@example.com'}, invitee: null}];
        mocks.getInvitations.mockResolvedValue(invitations);

        const res = await testRequest(app, 'GET', `${base}/invitations`, {appContext: appContext()});

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual(invitations);
        expect(mocks.getInvitations).toHaveBeenCalledWith({integrationId: 'int-1', integrationRoles: {'int-1': role}});
    });

    it('GET invitations is forbidden for a viewer', async () => {
        mocks.role = 'viewer';

        const res = await testRequest(app, 'GET', `${base}/invitations`, {appContext: appContext()});

        expect(res.status).toBe(403);
        expect(mocks.getInvitations).not.toHaveBeenCalled();
    });

    it('POST invitations creates an invitation and answers 201', async () => {
        mocks.createInvitation.mockResolvedValue({id: 'i1'});

        const res = await testRequest(app, 'POST', `${base}/invitations`, {
            appContext: appContext(),
            body: {email: 'a@example.com', role: 'member', sendEmail: true},
        });

        expect(res.status).toBe(201);
        expect(await res.json()).toEqual({id: 'i1'});
        expect(mocks.createInvitation).toHaveBeenCalledWith({
            integrationId: 'int-1',
            input: {email: 'a@example.com', role: 'member', sendEmail: true},
            requestingUserId: 7,
            integrationIds: ['int-1'],
        });
    });

    it('POST invitations rejects a malformed body, an invalid email and an invalid role', async () => {
        const malformed = await testRequest(app, 'POST', `${base}/invitations`, {appContext: appContext(), body: '{nope'});
        const badEmail = await testRequest(app, 'POST', `${base}/invitations`, {appContext: appContext(), body: {email: 1, role: 'member'}});
        const badRole = await testRequest(app, 'POST', `${base}/invitations`, {appContext: appContext(), body: {role: 'root'}});

        expect((await malformed.json()).message).toBe('Invalid request body');
        expect((await badEmail.json()).message).toBe('Invalid email');
        expect((await badRole.json()).message).toBe('Missing or invalid role');
        expect(mocks.createInvitation).not.toHaveBeenCalled();
    });

    it('POST resend answers 204', async () => {
        const res = await testRequest(app, 'POST', `${base}/invitations/inv-1/resend`, {appContext: appContext()});

        expect(res.status).toBe(204);
        expect(mocks.resendInvitation).toHaveBeenCalledWith({
            integrationId: 'int-1',
            invitationId: 'inv-1',
            resendingUserId: 7,
            integrationIds: ['int-1'],
        });
    });

    it('DELETE invitation answers 204', async () => {
        const res = await testRequest(app, 'DELETE', `${base}/invitations/inv-1`, {appContext: appContext()});

        expect(res.status).toBe(204);
        expect(mocks.revokeInvitation).toHaveBeenCalledWith({integrationId: 'int-1', invitationId: 'inv-1', integrationIds: ['int-1']});
    });

    it('POST accept accepts the invitation for the caller without an integration role', async () => {
        const res = await testRequest(app, 'POST', '/api/invitations/accept', {appContext: appContext(), body: {inviteToken: 'tok'}});

        expect(res.status).toBe(204);
        expect(mocks.acceptInvitation).toHaveBeenCalledWith({inviteToken: 'tok', acceptingUserId: 7});
    });

    it('POST accept rejects a missing user, a malformed body and a missing token', async () => {
        const anonymous = await testRequest(app, 'POST', '/api/invitations/accept', {body: {inviteToken: 'tok'}});
        const malformed = await testRequest(app, 'POST', '/api/invitations/accept', {appContext: appContext(), body: '{nope'});
        const noToken = await testRequest(app, 'POST', '/api/invitations/accept', {appContext: appContext(), body: {}});

        expect((await anonymous.json()).message).toBe('Authentication required');
        expect((await malformed.json()).message).toBe('Invalid request body');
        expect((await noToken.json()).message).toBe('Missing or invalid invite token');
        expect(mocks.acceptInvitation).not.toHaveBeenCalled();
    });
});
