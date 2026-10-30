import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockWithRlsTransaction = vi.fn();
const mockDbTransaction = vi.fn();
const mockDbSelect = vi.fn();
let mockSlackTeamId: string | undefined;

vi.mock('@gitgazer/db/client', () => ({
    withRlsTransaction: (...args: any[]) => mockWithRlsTransaction(...args),
    db: {transaction: (...args: any[]) => mockDbTransaction(...args), select: (...args: any[]) => mockDbSelect(...args)},
}));

vi.mock('@/domains/apps/apps.controller', () => ({findSlackTeamId: async () => mockSlackTeamId}));

vi.mock('@gitgazer/db/schema/gitgazer', () => ({
    integrationInvitations: Symbol('integrationInvitations'),
    users: Symbol('users'),
    integrationAppSlackSettings: Symbol('integrationAppSlackSettings'),
    slackUserLinks: Symbol('slackUserLinks'),
    integrations: Symbol('integrations'),
}));

// The views are built from the real tables at import time, which the stand-ins above can't do.
vi.mock('@gitgazer/db/schema/views', () => {
    const view = (name: string, columns: string[]) => ({name, ...Object.fromEntries(columns.map((column) => [column, Symbol(`${name}.${column}`)]))});
    return {
        userAssignmentsView: view('user_assignments_view', ['integrationId', 'userId', 'role', 'source', 'createdAt']),
        usersView: view('users_view', ['id', 'email', 'name', 'picture', 'githubLogin', 'lastActiveAt']),
        integrationInvitationsView: view('integration_invitations_view', ['integrationId', 'status', 'createdAt']),
    };
});

vi.mock('@gitgazer/db/schema/github/workflows', () => ({
    userAssignments: Symbol('userAssignments'),
}));

vi.mock('@gitgazer/db/schema/app', () => ({
    gitgazerWriter: {name: 'gitgazer_writer'},
}));

const mockSendInvitationEmail = vi.fn();
vi.mock('@/shared/clients/ses.client', () => ({
    sendInvitationEmail: (...args: any[]) => mockSendInvitationEmail(...args),
}));

const mockCreateEventLogEntry = vi.fn();
vi.mock('@gitgazer/backend-services/event-log.controller', () => ({
    createEventLogEntry: (...args: any[]) => mockCreateEventLogEntry(...args),
}));

let controller: typeof import('./members.controller');

// Each tx.select() resolves to the next result; the reads record their fields and tables.
const selectTx = (...results: unknown[][]) => {
    const tx = {
        reads: [] as {fields: any; tables: unknown[]; orderBy: unknown[]}[],
        select: (fields?: unknown) => {
            const read = {fields, tables: [] as unknown[], orderBy: [] as unknown[]};
            const result = results[tx.reads.length] ?? [];
            tx.reads.push(read);
            const chain = {
                from: (table: unknown) => (read.tables.push(table), chain),
                innerJoin: (table: unknown) => (read.tables.push(table), chain),
                where: () => chain,
                orderBy: (...columns: unknown[]) => (read.orderBy.push(...columns), chain),
                then: (resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
            };
            return chain;
        },
    };
    return tx;
};

const membersTx = (members: unknown[], githubIds: {userId: number; githubId: number | null}[]) => selectTx(members, githubIds);

const masterLinks = (rows: {githubUserId: number}[]) => {
    const read = {fields: [] as Record<string, unknown>[], tables: [] as unknown[]};
    mockDbSelect.mockImplementation((fields: Record<string, unknown>) => {
        read.fields.push(fields);
        return {
            from: (table: unknown) => {
                read.tables.push(table);
                return {where: () => Promise.resolve(rows)};
            },
        };
    });
    return read;
};

describe('members controller', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        mockDbSelect.mockReset();
        mockSlackTeamId = undefined;
        mockSendInvitationEmail.mockResolvedValue(undefined);
        mockCreateEventLogEntry.mockResolvedValue({});
        controller = await import('./members.controller');
    });

    // ---- getMembers ----

    describe('getMembers', () => {
        const member = (userId: number, email: string | null) => ({
            integrationId: 'int-1',
            userId,
            role: 'member',
            source: 'manual',
            createdAt: new Date('2024-01-15'),
            user: {id: userId, email, name: `User ${userId}`, picture: null, githubLogin: `user${userId}`, lastActiveAt: null},
        });

        it('throws ForbiddenError when integration is not accessible', async () => {
            await expect(controller.getMembers({integrationId: 'int-1', integrationRoles: {'int-2': 'admin'}})).rejects.toThrow(
                'Integration not accessible',
            );
            expect(mockWithRlsTransaction).not.toHaveBeenCalled();
        });

        it('returns the members as the views give them', async () => {
            const members = [member(1, 'u1@example.com'), member(2, null)];
            mockWithRlsTransaction.mockImplementation(async (params) => params.callback(membersTx(members, [])));

            const result = await controller.getMembers({integrationId: 'int-1', integrationRoles: {'int-1': 'viewer'}});

            expect(result).toEqual([
                {...member(1, 'u1@example.com'), slackLinked: false},
                {...member(2, null), slackLinked: false},
            ]);
            expect(mockDbSelect).not.toHaveBeenCalled();
        });

        it('reads through the role-aware views with the given roles, in a stable order', async () => {
            const tx = membersTx([], []);
            mockWithRlsTransaction.mockImplementation(async (params) => params.callback(tx));
            const integrationRoles = {'int-1': 'viewer', 'int-2': 'admin'} as const;
            const {userAssignmentsView, usersView} = await import('@gitgazer/db/schema/views');

            await controller.getMembers({integrationId: 'int-1', integrationRoles});

            expect(mockWithRlsTransaction).toHaveBeenCalledWith(expect.objectContaining({integrationIds: ['int-1', 'int-2'], integrationRoles}));
            expect(tx.reads[0].tables).toEqual([userAssignmentsView, usersView]);
            // Explicit columns, so a new users column never reaches the browser
            expect(tx.reads[0].fields.user).toEqual({
                id: usersView.id,
                email: usersView.email,
                name: usersView.name,
                picture: usersView.picture,
                githubLogin: usersView.githubLogin,
                lastActiveAt: usersView.lastActiveAt,
            });
            expect(Object.keys(tx.reads[0].fields)).toEqual(['integrationId', 'userId', 'role', 'source', 'createdAt', 'user']);
            expect(tx.reads[0].orderBy).toEqual([userAssignmentsView.createdAt, userAssignmentsView.userId]);
        });

        it('members list marks linked members and never returns Slack IDs', async () => {
            const members = [1, 2, 3].map((userId) => member(userId, null));
            mockSlackTeamId = 'T1';
            const tx = membersTx(members, [
                {userId: 1, githubId: 101},
                {userId: 2, githubId: 202},
                {userId: 3, githubId: null},
            ]);
            mockWithRlsTransaction.mockImplementation(async (params) => params.callback(tx));
            const links = masterLinks([{githubUserId: 202}]);
            const {slackUserLinks} = await import('@gitgazer/db/schema/gitgazer');

            const result = await controller.getMembers({integrationId: 'int-1', integrationRoles: {'int-1': 'viewer'}});

            expect(result.map((m) => [m.userId, m.slackLinked])).toEqual([
                [1, false],
                [2, true],
                [3, false],
            ]);
            // slack_user_links is global and revoked from the RLS roles, so only the master connection may read it
            expect(tx.reads.flatMap((read) => read.tables)).not.toContain(slackUserLinks);
            expect(links.tables).toEqual([slackUserLinks]);
            expect(Object.keys(links.fields[0])).toEqual(['githubUserId']);
            expect(JSON.stringify(result)).not.toContain('slackUserId');
            expect(JSON.stringify(result)).not.toContain('githubId');
        });
    });

    // ---- changeRole ----

    describe('changeRole', () => {
        it('throws BadRequestError when trying to change own role', async () => {
            await expect(
                controller.changeRole({
                    integrationId: 'int-1',
                    targetUserId: 1,
                    newRole: 'admin',
                    requestingUserId: 1,
                    requestingRole: 'owner',
                    integrationIds: ['int-1'],
                }),
            ).rejects.toThrow('Cannot change your own role');
        });

        it('throws BadRequestError for invalid role', async () => {
            await expect(
                controller.changeRole({
                    integrationId: 'int-1',
                    targetUserId: 2,
                    newRole: 'superadmin' as any,
                    requestingUserId: 1,
                    requestingRole: 'owner',
                    integrationIds: ['int-1'],
                }),
            ).rejects.toThrow('Invalid role');
        });

        it('throws ForbiddenError when admin tries to assign owner role', async () => {
            await expect(
                controller.changeRole({
                    integrationId: 'int-1',
                    targetUserId: 2,
                    newRole: 'owner',
                    requestingUserId: 1,
                    requestingRole: 'admin',
                    integrationIds: ['int-1'],
                }),
            ).rejects.toThrow('Only owners can assign the owner role');
        });

        it('throws ForbiddenError when admin tries to change an admin target', async () => {
            mockWithRlsTransaction.mockImplementation(async (params) => {
                const mockTx = {
                    select: () => ({
                        from: () => ({
                            innerJoin: () => ({
                                where: () => Promise.resolve([{role: 'admin', name: 'Admin User', email: 'admin@example.com'}]),
                            }),
                        }),
                    }),
                };
                return params.callback(mockTx);
            });

            await expect(
                controller.changeRole({
                    integrationId: 'int-1',
                    targetUserId: 2,
                    newRole: 'member',
                    requestingUserId: 1,
                    requestingRole: 'admin',
                    integrationIds: ['int-1'],
                }),
            ).rejects.toThrow('Cannot change the role of an owner or admin');
        });

        it('successfully changes role when requester is owner', async () => {
            mockWithRlsTransaction.mockImplementation(async (params) => {
                const mockTx = {
                    select: () => ({
                        from: () => ({
                            innerJoin: () => ({
                                where: () => Promise.resolve([{role: 'member', name: 'Alex Rivera', email: 'alex@example.com'}]),
                            }),
                        }),
                    }),
                    update: () => ({
                        set: () => ({
                            where: () => ({
                                returning: () => Promise.resolve([{role: 'admin'}]),
                            }),
                        }),
                    }),
                };
                return params.callback(mockTx);
            });

            await expect(
                controller.changeRole({
                    integrationId: 'int-1',
                    targetUserId: 2,
                    newRole: 'admin',
                    requestingUserId: 1,
                    requestingRole: 'owner',
                    integrationIds: ['int-1'],
                }),
            ).resolves.toBeUndefined();

            expect(mockWithRlsTransaction).toHaveBeenCalledWith(expect.objectContaining({userName: 'gitgazer_writer'}));
            expect(mockCreateEventLogEntry).toHaveBeenCalledWith(
                expect.objectContaining({
                    integrationId: 'int-1',
                    category: 'integration',
                    type: 'info',
                    title: 'Member role changed',
                    message: 'Alex Rivera role changed from "member" to "admin"',
                    metadata: {integrationId: 'int-1', targetUserId: 2, role: 'admin', previousRole: 'member'},
                }),
            );
        });
    });

    describe('changeRole fallback', () => {
        it('names a member without a name by GitHub login, never by email', async () => {
            mockWithRlsTransaction.mockImplementation(async (params) =>
                params.callback({
                    select: () => ({
                        from: () => ({innerJoin: () => ({where: () => Promise.resolve([{role: 'member', name: null, githubLogin: 'octocat'}])})}),
                    }),
                    update: () => ({set: () => ({where: () => ({returning: () => Promise.resolve([{role: 'admin'}])})})}),
                }),
            );

            await controller.changeRole({
                integrationId: 'int-1',
                targetUserId: 2,
                newRole: 'admin',
                requestingUserId: 1,
                requestingRole: 'owner',
                integrationIds: ['int-1'],
            });

            expect(mockCreateEventLogEntry).toHaveBeenCalledWith(expect.objectContaining({message: 'octocat role changed from "member" to "admin"'}));
        });
    });

    describe('resendInvitation event log', () => {
        it('writes an entry without the invitee email', async () => {
            const {default: config} = await import('@gitgazer/backend-core/config');
            vi.spyOn(config, 'get').mockImplementation(((key: string) => (key === 'sesConfig' ? {emailEnabled: true} : undefined)) as any);
            const invitation = {email: 'jamie@example.com', role: 'member', inviteToken: 'token-1'};
            mockWithRlsTransaction.mockImplementation(async (params) =>
                params.callback({
                    select: () => ({from: () => ({where: () => Promise.resolve([invitation])})}),
                    update: () => ({set: () => ({where: () => Promise.resolve()})}),
                }),
            );

            await controller.resendInvitation({integrationId: 'int-1', invitationId: 'inv-1', resendingUserId: 1, integrationIds: ['int-1']});

            expect(mockCreateEventLogEntry).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Invitation resent',
                    message: 'An invitation was resent',
                    metadata: {integrationId: 'int-1', invitationId: 'inv-1'},
                }),
            );
        });
    });

    // ---- removeMember ----

    describe('removeMember', () => {
        it('throws BadRequestError when trying to remove self', async () => {
            await expect(
                controller.removeMember({
                    integrationId: 'int-1',
                    targetUserId: 1,
                    requestingUserId: 1,
                    requestingRole: 'admin',
                    integrationIds: ['int-1'],
                }),
            ).rejects.toThrow('Cannot remove yourself');
        });

        it('throws ForbiddenError when target is an owner', async () => {
            mockWithRlsTransaction.mockImplementation(async (params) => {
                const mockTx = {
                    select: () => ({
                        from: () => ({
                            innerJoin: () => ({
                                where: () => Promise.resolve([{role: 'owner', name: 'Owner', email: 'owner@example.com'}]),
                            }),
                        }),
                    }),
                };
                return params.callback(mockTx);
            });

            await expect(
                controller.removeMember({
                    integrationId: 'int-1',
                    targetUserId: 2,
                    requestingUserId: 1,
                    requestingRole: 'admin',
                    integrationIds: ['int-1'],
                }),
            ).rejects.toThrow('Cannot remove an owner');
        });

        it('throws ForbiddenError when admin tries to remove another admin', async () => {
            mockWithRlsTransaction.mockImplementation(async (params) => {
                const mockTx = {
                    select: () => ({
                        from: () => ({
                            innerJoin: () => ({
                                where: () => Promise.resolve([{role: 'admin', name: 'Admin User', email: 'admin@example.com'}]),
                            }),
                        }),
                    }),
                };
                return params.callback(mockTx);
            });

            await expect(
                controller.removeMember({
                    integrationId: 'int-1',
                    targetUserId: 2,
                    requestingUserId: 1,
                    requestingRole: 'admin',
                    integrationIds: ['int-1'],
                }),
            ).rejects.toThrow('Only owners can remove admins');
        });
    });

    // ---- getInvitations ----

    describe('getInvitations', () => {
        const invitation = (inviteToken: string | null) => ({
            integrationId: 'int-1',
            id: 'inv-1',
            email: inviteToken ? 'jamie@example.com' : null,
            role: 'member',
            invitedBy: 42,
            inviteeId: 43,
            inviteToken,
            status: 'pending',
            createdAt: new Date('2024-12-01'),
            expiresAt: new Date('2025-01-01'),
        });
        const sarah = {id: 42, name: 'Sarah Chen', email: 'sarah@example.com', picture: null, githubLogin: 'sarah'};
        const jamie = {id: 43, name: 'Jamie', email: null, picture: null, githubLogin: 'jamie'};

        it('throws ForbiddenError when integration is not accessible', async () => {
            await expect(controller.getInvitations({integrationId: 'int-1', integrationRoles: {'int-2': 'admin'}})).rejects.toThrow(
                'Integration not accessible',
            );
            expect(mockWithRlsTransaction).not.toHaveBeenCalled();
        });

        it('returns invitations with inviter and invitee', async () => {
            mockWithRlsTransaction.mockImplementation(async (params) => params.callback(selectTx([invitation('token-123')], [sarah, jamie])));

            const result = await controller.getInvitations({integrationId: 'int-1', integrationRoles: {'int-1': 'admin'}});

            expect(result).toEqual([{...invitation('token-123'), invitedByUser: sarah, invitee: jamie}]);
        });

        it('leaves out the invite token where the view masks it, as the API did before', async () => {
            mockWithRlsTransaction.mockImplementation(async (params) => params.callback(selectTx([invitation(null)], [sarah])));

            const [result] = await controller.getInvitations({integrationId: 'int-1', integrationRoles: {'int-1': 'member'}});

            expect(result).not.toHaveProperty('inviteToken');
            expect(result).toMatchObject({email: null, invitedByUser: sarah, invitee: null});
        });

        it('keeps a link-only invitation without an invitee and skips the user read without users', async () => {
            const tx = selectTx([]);
            mockWithRlsTransaction.mockImplementation(async (params) => params.callback(tx));

            expect(await controller.getInvitations({integrationId: 'int-1', integrationRoles: {'int-1': 'member'}})).toEqual([]);
            expect(tx.reads).toHaveLength(1);
        });

        it('reads through the role-aware views with the given roles, in a stable order, and only public user fields', async () => {
            const tx = selectTx([invitation('token-123')], []);
            mockWithRlsTransaction.mockImplementation(async (params) => params.callback(tx));
            const integrationRoles = {'int-1': 'member', 'int-2': 'owner'} as const;
            const {integrationInvitationsView, usersView} = await import('@gitgazer/db/schema/views');

            await controller.getInvitations({integrationId: 'int-1', integrationRoles});

            expect(mockWithRlsTransaction).toHaveBeenCalledWith(expect.objectContaining({integrationIds: ['int-1', 'int-2'], integrationRoles}));
            expect(tx.reads.map((read) => read.tables)).toEqual([[integrationInvitationsView], [usersView]]);
            expect(tx.reads[0].orderBy).toEqual([integrationInvitationsView.createdAt]);
            expect(tx.reads[1].fields).toEqual({
                id: usersView.id,
                name: usersView.name,
                picture: usersView.picture,
                githubLogin: usersView.githubLogin,
                email: usersView.email,
            });
        });
    });

    // ---- createInvitation ----

    describe('createInvitation', () => {
        it('throws BadRequestError for invalid email', async () => {
            await expect(
                controller.createInvitation({
                    integrationId: 'int-1',
                    input: {email: 'invalid', role: 'member', sendEmail: false},
                    requestingUserId: 1,
                    integrationIds: ['int-1'],
                }),
            ).rejects.toThrow('Invalid email');
        });

        it('throws BadRequestError when sendEmail is true but no email provided', async () => {
            await expect(
                controller.createInvitation({
                    integrationId: 'int-1',
                    input: {role: 'member', sendEmail: true},
                    requestingUserId: 1,
                    integrationIds: ['int-1'],
                }),
            ).rejects.toThrow('Email is required when sending an invitation email');
        });

        it('creates invitation without email (link-only)', async () => {
            mockWithRlsTransaction.mockImplementation(async (params) => {
                const mockTx = {
                    select: () => ({
                        from: () => ({
                            where: () => Promise.resolve([{role: 'admin'}]),
                        }),
                    }),
                    insert: () => ({
                        values: () => ({
                            returning: () =>
                                Promise.resolve([
                                    {
                                        id: 'inv-1',
                                        integrationId: 'int-1',
                                        email: null,
                                        role: 'member',
                                        invitedBy: 1,
                                        inviteeId: null,
                                        inviteToken: 'token-abc',
                                        status: 'pending',
                                        createdAt: new Date(),
                                        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                                    },
                                ]),
                        }),
                    }),
                };
                return params.callback(mockTx);
            });

            const result = await controller.createInvitation({
                integrationId: 'int-1',
                input: {role: 'member', sendEmail: false},
                requestingUserId: 1,
                integrationIds: ['int-1'],
            });

            expect(result.email).toBeNull();
            expect(result.inviteToken).toBe('token-abc');
            expect(mockSendInvitationEmail).not.toHaveBeenCalled();
            expect(mockCreateEventLogEntry).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Invitation created with role "member"',
                    metadata: {integrationId: 'int-1', role: 'member', invitationId: 'inv-1'},
                }),
            );
        });

        it('throws BadRequestError for invalid role', async () => {
            await expect(
                controller.createInvitation({
                    integrationId: 'int-1',
                    input: {email: 'test@example.com', role: 'superadmin' as any, sendEmail: false},
                    requestingUserId: 1,
                    integrationIds: ['int-1'],
                }),
            ).rejects.toThrow('Invalid role');
        });

        it('throws BadRequestError when creating invitation with owner role', async () => {
            await expect(
                controller.createInvitation({
                    integrationId: 'int-1',
                    input: {email: 'test@example.com', role: 'owner', sendEmail: false},
                    requestingUserId: 1,
                    integrationIds: ['int-1'],
                }),
            ).rejects.toThrow('Cannot create an invitation with the owner role');
        });

        it('throws ForbiddenError when requester is not admin or owner', async () => {
            mockWithRlsTransaction.mockImplementation(async (params) => {
                const mockTx = {
                    select: () => ({
                        from: () => ({
                            where: () => Promise.resolve([{role: 'viewer'}]),
                        }),
                    }),
                };
                return params.callback(mockTx);
            });

            await expect(
                controller.createInvitation({
                    integrationId: 'int-1',
                    input: {email: 'test@example.com', role: 'member', sendEmail: false},
                    requestingUserId: 1,
                    integrationIds: ['int-1'],
                }),
            ).rejects.toThrow();
        });
    });

    // ---- revokeInvitation ----

    describe('revokeInvitation', () => {
        it('throws NotFoundError when invitation does not exist', async () => {
            mockWithRlsTransaction.mockImplementation(async (params) => {
                const mockTx = {
                    delete: () => ({
                        where: () => ({
                            returning: () => Promise.resolve([]),
                        }),
                    }),
                };
                return params.callback(mockTx);
            });

            await expect(
                controller.revokeInvitation({
                    integrationId: 'int-1',
                    invitationId: 'inv-999',
                    integrationIds: ['int-1'],
                }),
            ).rejects.toThrow('Invitation not found');
        });

        it('successfully deletes a pending invitation', async () => {
            mockWithRlsTransaction.mockImplementation(async (params) => {
                const mockTx = {
                    delete: () => ({
                        where: () => ({
                            returning: () => Promise.resolve([{id: 'inv-1', status: 'pending', email: 'jamie@example.com'}]),
                        }),
                    }),
                };
                return params.callback(mockTx);
            });

            await expect(
                controller.revokeInvitation({
                    integrationId: 'int-1',
                    invitationId: 'inv-1',
                    integrationIds: ['int-1'],
                }),
            ).resolves.toBeUndefined();

            expect(mockWithRlsTransaction).toHaveBeenCalledWith(expect.objectContaining({userName: 'gitgazer_writer'}));
            expect(mockCreateEventLogEntry).toHaveBeenCalledWith(
                expect.objectContaining({
                    integrationId: 'int-1',
                    category: 'integration',
                    type: 'info',
                    title: 'Invitation revoked',
                    message: 'An invitation was revoked',
                    metadata: {integrationId: 'int-1', invitationId: 'inv-1'},
                }),
            );
        });
    });

    // ---- acceptInvitation ----

    describe('acceptInvitation', () => {
        it('throws NotFoundError when invitation does not exist', async () => {
            mockDbTransaction.mockImplementation(async (callback) => {
                const mockTx = {
                    select: () => ({
                        from: () => ({
                            where: () => Promise.resolve([]),
                        }),
                    }),
                };
                return callback(mockTx);
            });

            await expect(
                controller.acceptInvitation({
                    inviteToken: 'nonexistent-token',
                    acceptingUserId: 1,
                }),
            ).rejects.toThrow('Invitation not found or cannot be accepted');
        });

        it('throws NotFoundError when invitation has expired', async () => {
            // Expired invitations are filtered out by the WHERE clause,
            // so the select returns empty — same as "not found"
            mockDbTransaction.mockImplementation(async (callback) => {
                const mockTx = {
                    select: () => ({
                        from: () => ({
                            where: () => Promise.resolve([]),
                        }),
                    }),
                };
                return callback(mockTx);
            });

            await expect(
                controller.acceptInvitation({
                    inviteToken: 'token-123',
                    acceptingUserId: 1,
                }),
            ).rejects.toThrow('Invitation not found or cannot be accepted');
        });

        it('successfully accepts invitation and creates user assignment', async () => {
            const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            const insertedValues: Record<string, unknown>[] = [];
            let selectCallCount = 0;

            mockDbTransaction.mockImplementation(async (callback) => {
                const mockTx = {
                    select: () => ({
                        from: () => ({
                            where: () => {
                                selectCallCount++;
                                // First select: fetch invitation; second: check membership; third: resolve user name
                                if (selectCallCount === 1) {
                                    return Promise.resolve([
                                        {
                                            id: 'inv-1',
                                            integrationId: 'int-1',
                                            email: 'jamie@example.com',
                                            role: 'member',
                                            status: 'pending',
                                            inviteToken: 'token-123',
                                            expiresAt: futureDate,
                                        },
                                    ]);
                                }
                                if (selectCallCount === 2) {
                                    return Promise.resolve([]);
                                }
                                // Third: user name lookup
                                return Promise.resolve([{name: 'Jamie Lee', email: 'jamie@example.com'}]);
                            },
                        }),
                    }),
                    update: () => ({
                        set: () => ({
                            where: () => ({
                                returning: () =>
                                    Promise.resolve([
                                        {
                                            id: 'inv-1',
                                            integrationId: 'int-1',
                                            status: 'accepted',
                                        },
                                    ]),
                            }),
                        }),
                    }),
                    insert: () => ({
                        values: (vals: Record<string, unknown>) => {
                            insertedValues.push(vals);
                            return Promise.resolve();
                        },
                    }),
                };
                return callback(mockTx);
            });

            await controller.acceptInvitation({
                inviteToken: 'token-123',
                acceptingUserId: 99,
            });

            expect(insertedValues).toEqual([
                {
                    integrationId: 'int-1',
                    userId: 99,
                    role: 'member',
                },
            ]);
            expect(mockCreateEventLogEntry).toHaveBeenCalledWith(
                expect.objectContaining({
                    integrationId: 'int-1',
                    category: 'integration',
                    type: 'success',
                    title: 'Invitation accepted',
                    message: 'Jamie Lee accepted an invitation and joined with role "member"',
                    metadata: {integrationId: 'int-1', targetUserId: 99, role: 'member', invitationId: 'inv-1'},
                }),
            );
        });

        it('throws BadRequestError when user is already a member without consuming the invitation', async () => {
            const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            let updateCalled = false;
            let selectCallCount = 0;

            mockDbTransaction.mockImplementation(async (callback) => {
                const mockTx = {
                    select: () => ({
                        from: () => ({
                            where: () => {
                                selectCallCount++;
                                if (selectCallCount === 1) {
                                    return Promise.resolve([
                                        {
                                            id: 'inv-1',
                                            integrationId: 'int-1',
                                            email: 'jamie@example.com',
                                            role: 'member',
                                            status: 'pending',
                                            inviteToken: 'token-123',
                                            expiresAt: futureDate,
                                        },
                                    ]);
                                }
                                // Second select: existing member found
                                return Promise.resolve([{userId: 99}]);
                            },
                        }),
                    }),
                    update: () => {
                        updateCalled = true;
                        return {
                            set: () => ({
                                where: () => ({
                                    returning: () => Promise.resolve([]),
                                }),
                            }),
                        };
                    },
                };
                return callback(mockTx);
            });

            await expect(
                controller.acceptInvitation({
                    inviteToken: 'token-123',
                    acceptingUserId: 99,
                }),
            ).rejects.toThrow('You are already a member of this integration');

            // Invitation was never claimed — no update called
            expect(updateCalled).toBe(false);
        });
    });

    // ---- leaveIntegration ----

    describe('leaveIntegration', () => {
        it.each([
            [{name: null, githubLogin: 'octocat'}, 'octocat left the integration'],
            [{name: null, githubLogin: null}, 'User 5 left the integration'],
        ])('never names a leaving member by email (%j)', async (user, message) => {
            mockWithRlsTransaction.mockImplementation(async (params) => {
                const mockTx = {
                    select: () => ({
                        from: () => ({innerJoin: () => ({where: () => Promise.resolve([{role: 'member', ...user, email: 'a@example.com'}])})}),
                    }),
                    delete: () => ({where: () => Promise.resolve()}),
                };
                return params.callback(mockTx);
            });

            await controller.leaveIntegration({integrationId: 'int-1', userId: 5, integrationIds: ['int-1']});

            expect(mockCreateEventLogEntry).toHaveBeenCalledWith(expect.objectContaining({message}));
        });

        it('throws ForbiddenError when integration is not accessible', async () => {
            await expect(controller.leaveIntegration({integrationId: 'int-1', userId: 1, integrationIds: ['int-2']})).rejects.toThrow(
                'Integration not accessible',
            );
        });

        it('throws NotFoundError when user is not a member', async () => {
            mockWithRlsTransaction.mockImplementation(async (params) => {
                const mockTx = {
                    select: () => ({
                        from: () => ({
                            innerJoin: () => ({
                                where: () => Promise.resolve([]),
                            }),
                        }),
                    }),
                };
                return params.callback(mockTx);
            });

            await expect(controller.leaveIntegration({integrationId: 'int-1', userId: 99, integrationIds: ['int-1']})).rejects.toThrow(
                'You are not a member of this integration',
            );
        });

        it('throws ForbiddenError when owner tries to leave', async () => {
            mockWithRlsTransaction.mockImplementation(async (params) => {
                const mockTx = {
                    select: () => ({
                        from: () => ({
                            innerJoin: () => ({
                                where: () => Promise.resolve([{role: 'owner', name: 'Owner', email: 'owner@example.com'}]),
                            }),
                        }),
                    }),
                };
                return params.callback(mockTx);
            });

            await expect(controller.leaveIntegration({integrationId: 'int-1', userId: 1, integrationIds: ['int-1']})).rejects.toThrow(
                'The owner cannot leave the integration',
            );
        });

        it('successfully removes a member who leaves', async () => {
            let deleteCalled = false;
            mockWithRlsTransaction.mockImplementation(async (params) => {
                const mockTx = {
                    select: () => ({
                        from: () => ({
                            innerJoin: () => ({
                                where: () => Promise.resolve([{role: 'member', name: 'Test User', email: 'test@example.com'}]),
                            }),
                        }),
                    }),
                    delete: () => {
                        deleteCalled = true;
                        return {
                            where: () => Promise.resolve(),
                        };
                    },
                };
                return params.callback(mockTx);
            });

            await expect(controller.leaveIntegration({integrationId: 'int-1', userId: 5, integrationIds: ['int-1']})).resolves.toBeUndefined();

            expect(deleteCalled).toBe(true);
            expect(mockWithRlsTransaction).toHaveBeenCalledWith(expect.objectContaining({userName: 'gitgazer_writer'}));
            expect(mockCreateEventLogEntry).toHaveBeenCalledWith(
                expect.objectContaining({
                    integrationId: 'int-1',
                    category: 'integration',
                    type: 'info',
                    title: 'Member left',
                    message: 'Test User left the integration',
                }),
            );
        });

        it('allows viewer to leave', async () => {
            let deleteCalled = false;
            mockWithRlsTransaction.mockImplementation(async (params) => {
                const mockTx = {
                    select: () => ({
                        from: () => ({
                            innerJoin: () => ({
                                where: () => Promise.resolve([{role: 'viewer', name: 'Viewer User', email: 'viewer@example.com'}]),
                            }),
                        }),
                    }),
                    delete: () => {
                        deleteCalled = true;
                        return {
                            where: () => Promise.resolve(),
                        };
                    },
                };
                return params.callback(mockTx);
            });

            await expect(controller.leaveIntegration({integrationId: 'int-1', userId: 10, integrationIds: ['int-1']})).resolves.toBeUndefined();

            expect(deleteCalled).toBe(true);
        });
    });
});
