import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockWithRlsTransaction = vi.fn();
vi.mock('@gitgazer/db/client', () => ({
    withRlsTransaction: (...args: any[]) => mockWithRlsTransaction(...args),
}));

vi.mock('@gitgazer/db/schema', () => ({
    eventLogEntries: Symbol('eventLogEntries'),
    gitgazerWriter: {name: 'gitgazer_writer'},
    repositories: Symbol('repositories'),
}));

let eventLog: typeof import('./event-log.controller');

describe('event-log controller', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        eventLog = await import('./event-log.controller');
    });

    // ---------------------------------------------------------------
    // getEventLogEntries
    // ---------------------------------------------------------------
    describe('getEventLogEntries', () => {
        it('returns [] when integrationIds is empty', async () => {
            const out = await eventLog.getEventLogEntries({integrationIds: []});
            expect(out).toEqual([]);
            expect(mockWithRlsTransaction).not.toHaveBeenCalled();
        });

        it('calls withRlsTransaction with integrationIds', async () => {
            mockWithRlsTransaction.mockResolvedValue([]);
            await eventLog.getEventLogEntries({integrationIds: ['int-1']});

            expect(mockWithRlsTransaction).toHaveBeenCalledOnce();
            expect(mockWithRlsTransaction).toHaveBeenCalledWith(expect.objectContaining({integrationIds: ['int-1']}));
        });

        it('passes callback to withRlsTransaction that builds query with no filters', async () => {
            const mockLimit = vi.fn().mockReturnThis();
            const mockOffset = vi.fn().mockResolvedValue([]);
            const mockOrderBy = vi.fn().mockReturnValue({limit: mockLimit});
            const mockWhere = vi.fn().mockReturnValue({orderBy: mockOrderBy});
            const mockFrom = vi.fn().mockReturnValue({where: mockWhere});
            const mockSelect = vi.fn().mockReturnValue({from: mockFrom});

            mockLimit.mockReturnValue({offset: mockOffset});

            mockWithRlsTransaction.mockImplementation(async (params: {callback: Function}) => {
                return params.callback({select: mockSelect});
            });

            const result = await eventLog.getEventLogEntries({integrationIds: ['int-1']});

            expect(mockSelect).toHaveBeenCalled();
            expect(mockFrom).toHaveBeenCalled();
            expect(mockWhere).toHaveBeenCalledWith(undefined); // no conditions
            expect(result).toEqual([]);
        });

        it('clamps limit to 100', async () => {
            const mockLimit = vi.fn().mockReturnThis();
            const mockOffset = vi.fn().mockResolvedValue([]);
            const mockOrderBy = vi.fn().mockReturnValue({limit: mockLimit});
            const mockWhere = vi.fn().mockReturnValue({orderBy: mockOrderBy});
            const mockFrom = vi.fn().mockReturnValue({where: mockWhere});
            const mockSelect = vi.fn().mockReturnValue({from: mockFrom});

            mockLimit.mockReturnValue({offset: mockOffset});

            mockWithRlsTransaction.mockImplementation(async (params: {callback: Function}) => {
                return params.callback({select: mockSelect});
            });

            await eventLog.getEventLogEntries({integrationIds: ['int-1'], filters: {limit: 500}});

            expect(mockLimit).toHaveBeenCalledWith(100);
        });

        it('defaults limit to 50 and offset to 0', async () => {
            const mockLimit = vi.fn().mockReturnThis();
            const mockOffset = vi.fn().mockResolvedValue([]);
            const mockOrderBy = vi.fn().mockReturnValue({limit: mockLimit});
            const mockWhere = vi.fn().mockReturnValue({orderBy: mockOrderBy});
            const mockFrom = vi.fn().mockReturnValue({where: mockWhere});
            const mockSelect = vi.fn().mockReturnValue({from: mockFrom});

            mockLimit.mockReturnValue({offset: mockOffset});

            mockWithRlsTransaction.mockImplementation(async (params: {callback: Function}) => {
                return params.callback({select: mockSelect});
            });

            await eventLog.getEventLogEntries({integrationIds: ['int-1']});

            expect(mockLimit).toHaveBeenCalledWith(50);
            expect(mockOffset).toHaveBeenCalledWith(0);
        });

        it('applies type filter when provided', async () => {
            const mockLimit = vi.fn().mockReturnThis();
            const mockOffset = vi.fn().mockResolvedValue([]);
            const mockOrderBy = vi.fn().mockReturnValue({limit: mockLimit});
            const mockWhere = vi.fn().mockReturnValue({orderBy: mockOrderBy});
            const mockFrom = vi.fn().mockReturnValue({where: mockWhere});
            const mockSelect = vi.fn().mockReturnValue({from: mockFrom});

            mockLimit.mockReturnValue({offset: mockOffset});

            mockWithRlsTransaction.mockImplementation(async (params: {callback: Function}) => {
                return params.callback({select: mockSelect});
            });

            await eventLog.getEventLogEntries({integrationIds: ['int-1'], filters: {type: 'failure'}});

            // When a type filter is set, where() should be called with a defined condition (not undefined)
            expect(mockWhere).toHaveBeenCalledWith(expect.anything());
            const whereArg = mockWhere.mock.calls[0][0];
            expect(whereArg).not.toBeUndefined();
        });

        it('applies search filter with escaped special characters', async () => {
            const mockLimit = vi.fn().mockReturnThis();
            const mockOffset = vi.fn().mockResolvedValue([]);
            const mockOrderBy = vi.fn().mockReturnValue({limit: mockLimit});
            const mockWhere = vi.fn().mockReturnValue({orderBy: mockOrderBy});
            const mockFrom = vi.fn().mockReturnValue({where: mockWhere});
            const mockSelect = vi.fn().mockReturnValue({from: mockFrom});

            mockLimit.mockReturnValue({offset: mockOffset});

            mockWithRlsTransaction.mockImplementation(async (params: {callback: Function}) => {
                return params.callback({select: mockSelect});
            });

            await eventLog.getEventLogEntries({integrationIds: ['int-1'], filters: {search: '100%_done'}});

            expect(mockWhere).toHaveBeenCalledWith(expect.anything());
            const whereArg = mockWhere.mock.calls[0][0];
            expect(whereArg).not.toBeUndefined();
        });

        it('applies repositoryIds filter via subquery', async () => {
            const mockSubqueryWhere = vi.fn().mockReturnValue('subquery-result');
            const mockSubqueryFrom = vi.fn().mockReturnValue({where: mockSubqueryWhere});

            const mockLimit = vi.fn().mockReturnThis();
            const mockOffset = vi.fn().mockResolvedValue([]);
            const mockOrderBy = vi.fn().mockReturnValue({limit: mockLimit});
            const mockMainWhere = vi.fn().mockReturnValue({orderBy: mockOrderBy});
            const mockMainFrom = vi.fn().mockReturnValue({where: mockMainWhere});

            mockLimit.mockReturnValue({offset: mockOffset});

            let selectCallCount = 0;
            mockWithRlsTransaction.mockImplementation(async (params: {callback: Function}) => {
                selectCallCount = 0;
                return params.callback({
                    select: () => {
                        selectCallCount++;
                        // First select() is the subquery for repository names
                        if (selectCallCount === 1) {
                            return {from: mockSubqueryFrom};
                        }
                        // Second select() is the main query
                        return {from: mockMainFrom};
                    },
                });
            });

            await eventLog.getEventLogEntries({integrationIds: ['int-1'], filters: {repositoryIds: [1, 2]}});

            expect(selectCallCount).toBe(2); // subquery + main query
            expect(mockMainWhere).toHaveBeenCalledWith(expect.anything());
            const whereArg = mockMainWhere.mock.calls[0][0];
            expect(whereArg).not.toBeUndefined();
        });

        it('applies topics filter via subquery with ?| operator', async () => {
            const mockSubqueryWhere = vi.fn().mockReturnValue('subquery-result');
            const mockSubqueryFrom = vi.fn().mockReturnValue({where: mockSubqueryWhere});

            const mockLimit = vi.fn().mockReturnThis();
            const mockOffset = vi.fn().mockResolvedValue([]);
            const mockOrderBy = vi.fn().mockReturnValue({limit: mockLimit});
            const mockMainWhere = vi.fn().mockReturnValue({orderBy: mockOrderBy});
            const mockMainFrom = vi.fn().mockReturnValue({where: mockMainWhere});

            mockLimit.mockReturnValue({offset: mockOffset});

            let selectCallCount = 0;
            mockWithRlsTransaction.mockImplementation(async (params: {callback: Function}) => {
                selectCallCount = 0;
                return params.callback({
                    select: () => {
                        selectCallCount++;
                        if (selectCallCount === 1) {
                            return {from: mockSubqueryFrom};
                        }
                        return {from: mockMainFrom};
                    },
                });
            });

            await eventLog.getEventLogEntries({integrationIds: ['int-1'], filters: {topics: ['frontend', 'backend']}});

            expect(selectCallCount).toBe(2); // subquery + main query
            expect(mockMainWhere).toHaveBeenCalledWith(expect.anything());
            const whereArg = mockMainWhere.mock.calls[0][0];
            expect(whereArg).not.toBeUndefined();
        });
    });

    // ---------------------------------------------------------------
    // getEventLogStats
    // ---------------------------------------------------------------
    describe('getEventLogStats', () => {
        it('returns zeroed stats when integrationIds is empty', async () => {
            const out = await eventLog.getEventLogStats({integrationIds: []});
            expect(out).toEqual({total: 0, unread: 0, read: 0});
            expect(mockWithRlsTransaction).not.toHaveBeenCalled();
        });

        it('returns stats from database query', async () => {
            mockWithRlsTransaction.mockImplementation(async (params: {callback: Function}) => {
                const mockFrom = vi.fn().mockResolvedValue([{total: 10, unread: 3, read: 7}]);
                const mockSelect = vi.fn().mockReturnValue({from: mockFrom});
                return params.callback({select: mockSelect});
            });

            const out = await eventLog.getEventLogStats({integrationIds: ['int-1']});
            expect(out).toEqual({total: 10, unread: 3, read: 7});
        });
    });

    // ---------------------------------------------------------------
    // toggleEventLogRead
    // ---------------------------------------------------------------
    describe('toggleEventLogRead', () => {
        it('returns updated entry when found', async () => {
            const entry = {id: 'abc', read: true};
            mockWithRlsTransaction.mockImplementation(async (params: {callback: Function}) => {
                const mockReturning = vi.fn().mockResolvedValue([entry]);
                const mockWhere = vi.fn().mockReturnValue({returning: mockReturning});
                const mockSet = vi.fn().mockReturnValue({where: mockWhere});
                const mockUpdate = vi.fn().mockReturnValue({set: mockSet});
                return params.callback({update: mockUpdate});
            });

            const out = await eventLog.toggleEventLogRead({id: 'abc', integrationIds: ['int-1'], read: true});
            expect(out).toEqual(entry);
        });

        it('returns null when entry not found', async () => {
            mockWithRlsTransaction.mockImplementation(async (params: {callback: Function}) => {
                const mockReturning = vi.fn().mockResolvedValue([]);
                const mockWhere = vi.fn().mockReturnValue({returning: mockReturning});
                const mockSet = vi.fn().mockReturnValue({where: mockWhere});
                const mockUpdate = vi.fn().mockReturnValue({set: mockSet});
                return params.callback({update: mockUpdate});
            });

            const out = await eventLog.toggleEventLogRead({id: 'missing', integrationIds: ['int-1'], read: true});
            expect(out).toBeNull();
        });

        it('uses gitgazerWriter as userName', async () => {
            mockWithRlsTransaction.mockImplementation(async (params: {callback: Function}) => {
                const mockReturning = vi.fn().mockResolvedValue([]);
                const mockWhere = vi.fn().mockReturnValue({returning: mockReturning});
                const mockSet = vi.fn().mockReturnValue({where: mockWhere});
                const mockUpdate = vi.fn().mockReturnValue({set: mockSet});
                return params.callback({update: mockUpdate});
            });

            await eventLog.toggleEventLogRead({id: 'abc', integrationIds: ['int-1'], read: false});
            expect(mockWithRlsTransaction).toHaveBeenCalledWith(expect.objectContaining({userName: 'gitgazer_writer'}));
        });
    });

    // ---------------------------------------------------------------
    // markAllEventLogRead
    // ---------------------------------------------------------------
    describe('markAllEventLogRead', () => {
        it('returns 0 when integrationIds is empty', async () => {
            const out = await eventLog.markAllEventLogRead({integrationIds: []});
            expect(out).toBe(0);
            expect(mockWithRlsTransaction).not.toHaveBeenCalled();
        });

        it('returns count of updated entries', async () => {
            mockWithRlsTransaction.mockImplementation(async (params: {callback: Function}) => {
                const mockReturning = vi.fn().mockResolvedValue([{id: '1'}, {id: '2'}, {id: '3'}]);
                const mockWhere = vi.fn().mockReturnValue({returning: mockReturning});
                const mockSet = vi.fn().mockReturnValue({where: mockWhere});
                const mockUpdate = vi.fn().mockReturnValue({set: mockSet});
                return params.callback({update: mockUpdate});
            });

            const out = await eventLog.markAllEventLogRead({integrationIds: ['int-1']});
            expect(out).toBe(3);
        });

        it('uses gitgazerWriter as userName', async () => {
            mockWithRlsTransaction.mockImplementation(async (params: {callback: Function}) => {
                const mockReturning = vi.fn().mockResolvedValue([]);
                const mockWhere = vi.fn().mockReturnValue({returning: mockReturning});
                const mockSet = vi.fn().mockReturnValue({where: mockWhere});
                const mockUpdate = vi.fn().mockReturnValue({set: mockSet});
                return params.callback({update: mockUpdate});
            });

            await eventLog.markAllEventLogRead({integrationIds: ['int-1']});
            expect(mockWithRlsTransaction).toHaveBeenCalledWith(expect.objectContaining({userName: 'gitgazer_writer'}));
        });
    });

    // ---------------------------------------------------------------
    // createEventLogEntry
    // ---------------------------------------------------------------
    describe('createEventLogEntry', () => {
        it('inserts an entry and returns it', async () => {
            const entry = {
                id: 'new-id',
                integrationId: 'int-1',
                category: 'notification',
                type: 'info',
                title: 'Test',
                message: 'Test message',
            };

            mockWithRlsTransaction.mockImplementation(async (params: {callback: Function}) => {
                const mockReturning = vi.fn().mockResolvedValue([entry]);
                const mockValues = vi.fn().mockReturnValue({returning: mockReturning});
                const mockInsert = vi.fn().mockReturnValue({values: mockValues});
                return params.callback({insert: mockInsert});
            });

            const out = await eventLog.createEventLogEntry({
                integrationId: 'int-1',
                category: 'notification',
                type: 'info',
                title: 'Test',
                message: 'Test message',
            });

            expect(out).toEqual(entry);
        });

        it('passes metadata when provided', async () => {
            const metadata = {repository: 'org/repo'};
            let capturedValues: any;

            mockWithRlsTransaction.mockImplementation(async (params: {callback: Function}) => {
                const mockReturning = vi.fn().mockResolvedValue([{id: 'new'}]);
                const mockValues = vi.fn().mockImplementation((v) => {
                    capturedValues = v;
                    return {returning: mockReturning};
                });
                const mockInsert = vi.fn().mockReturnValue({values: mockValues});
                return params.callback({insert: mockInsert});
            });

            await eventLog.createEventLogEntry({
                integrationId: 'int-1',
                category: 'notification',
                type: 'info',
                title: 'Test',
                message: 'msg',
                metadata,
            });

            expect(capturedValues).toEqual(expect.objectContaining({metadata}));
        });
    });
});
