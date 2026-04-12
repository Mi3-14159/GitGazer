import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockWithRlsTransaction = vi.fn();
const mockDbTransaction = vi.fn();

vi.mock('@gitgazer/db/client', () => ({
    withRlsTransaction: (...args: any[]) => mockWithRlsTransaction(...args),
    db: {transaction: (...args: any[]) => mockDbTransaction(...args)},
}));

vi.mock('@gitgazer/db/schema/gitgazer', () => ({
    integrationInvitations: Symbol('integrationInvitations'),
    users: Symbol('users'),
}));

vi.mock('@gitgazer/db/schema/github/workflows', () => ({
    userAssignments: Symbol('userAssignments'),
    integrations: Symbol('integrations'),
}));

vi.mock('@gitgazer/db/schema/app', () => ({
    gitgazerWriter: {name: 'gitgazer_writer'},
}));

const mockSendInvitationEmail = vi.fn();
vi.mock('@/shared/clients/ses.client', () => ({
    sendInvitationEmail: (...args: any[]) => mockSendInvitationEmail(...args),
}));

const mockCreateEventLogEntry = vi.fn();
vi.mock('@/domains/event-log/event-log.controller', () => ({
    createEventLogEntry: (...args: any[]) => mockCreateEventLogEntry(...args),
}));

let controller: typeof import('./members.controller');

describe('members controller', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        mockSendInvitationEmail.mockResolvedValue(undefined);
        mockCreateEventLogEntry.mockResolvedValue({});
        controller = await import('./members.controller');
    });

    // ---- getMembers ----

    describe('getMembers', () => {
        it('throws ForbiddenError when integration is not accessible', async () => {
            await expect(controller.getMembers({integrationId: 'int-1', integrationIds: ['int-2']})).rejects.toThrow('Integration not accessible');
            expect(mockWithRlsTransaction).not.toHaveBeenCalled();
        });

        it('returns members with profile data', async () => {
            const mockResult = [
                {
                    userId: 1,
                    role: 'owner',
                    createdAt: new Date('2024-01-15'),
                    integrationId: 'int-1',
                    user: {
                        id: 1,
                        cognitoId: 'cog-1',
                        email: 'sarah@example.com',
                        name: 'Sarah Chen',
                        picture: 'https://avatars.com/sarah.png',
                    },
                },
                {
                    userId: 2,
                    role: 'member',
                    createdAt: new Date('2024-03-10'),
                    integrationId: 'int-1',
                    user: {
                        id: 2,
                        cognitoId: 'cog-2',
                        email: 'alex@example.com',
                        name: 'Alex Rivera',
                        picture: null,
                    },
                },
            ];

            mockWithRlsTransaction.mockImplementation(async (params) => {
                const mockTx = {
                    query: {
                        userAssignments: {
                            findMany: () => Promise.resolve(mockResult),
                        },
                    },
                };
                return params.callback(mockTx);
            });

            const result = await controller.getMembers({integrationId: 'int-1', integrationIds: ['int-1']});

            expect(result).toEqual([
                {
                    userId: 1,
                    role: 'owner',
                    createdAt: new Date('2024-01-15'),
                    integrationId: 'int-1',
                    user: {
                        id: 1,
                        cognitoId: 'cog-1',
                        email: 'sarah@example.com',
                        name: 'Sarah Chen',
                        picture: 'https://avatars.com/sarah.png',
                    },
                },
                {
                    userId: 2,
                    role: 'member',
                    createdAt: new Date('2024-03-10'),
                    integrationId: 'int-1',
                    user: {
                        id: 2,
                        cognitoId: 'cog-2',
                        email: 'alex@example.com',
                        name: 'Alex Rivera',
                        picture: null,
                    },
                },
            ]);
            expect(mockWithRlsTransaction).toHaveBeenCalledWith(expect.objectContaining({integrationIds: ['int-1']}));
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
        it('throws ForbiddenError when integration is not accessible', async () => {
            await expect(controller.getInvitations({integrationId: 'int-1', integrationIds: ['int-2']})).rejects.toThrow(
                'Integration not accessible',
            );
        });

        it('returns invitations with inviter and invitee', async () => {
            const mockResult = [
                {
                    id: 'inv-1',
                    integrationId: 'int-1',
                    email: 'jamie@example.com',
                    role: 'member',
                    invitedBy: 42,
                    inviteeId: null,
                    inviteToken: 'token-123',
                    status: 'pending',
                    createdAt: new Date('2024-12-01'),
                    expiresAt: new Date('2025-01-01'),
                    invitedByUser: {id: 42, name: 'Sarah Chen', email: 'sarah@example.com', picture: null},
                    invitee: null,
                },
            ];

            mockWithRlsTransaction.mockImplementation(async (params) => {
                const mockTx = {
                    query: {
                        integrationInvitations: {
                            findMany: () => Promise.resolve(mockResult),
                        },
                    },
                };
                return params.callback(mockTx);
            });

            const result = await controller.getInvitations({integrationId: 'int-1', integrationIds: ['int-1']});

            expect(result).toEqual([
                {
                    id: 'inv-1',
                    integrationId: 'int-1',
                    email: 'jamie@example.com',
                    role: 'member',
                    invitedBy: 42,
                    inviteeId: null,
                    inviteToken: 'token-123',
                    invitedByUser: {id: 42, name: 'Sarah Chen', email: 'sarah@example.com', picture: null},
                    invitee: null,
                    status: 'pending',
                    createdAt: new Date('2024-12-01'),
                    expiresAt: new Date('2025-01-01'),
                },
            ]);
        });

        it('excludes accepted invitations from results', async () => {
            const mockFindMany = vi.fn().mockResolvedValue([]);

            mockWithRlsTransaction.mockImplementation(async (params) => {
                const mockTx = {
                    query: {
                        integrationInvitations: {
                            findMany: mockFindMany,
                        },
                    },
                };
                return params.callback(mockTx);
            });

            await controller.getInvitations({integrationId: 'int-1', integrationIds: ['int-1']});

            expect(mockFindMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.anything(),
                }),
            );
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
                    message: 'Invitation for jamie@example.com was revoked',
                    metadata: {integrationId: 'int-1', targetEmail: 'jamie@example.com', invitationId: 'inv-1'},
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
