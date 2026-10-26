import {notificationHandles, notificationRuleDestinations} from '@gitgazer/db/schema/gitgazer';
import {sql, type SQL} from 'drizzle-orm';
import {PgDialect} from 'drizzle-orm/pg-core';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const selectQueue: unknown[][] = [];
const deletedTables: unknown[] = [];
const deleteWhere: unknown[] = [];
const updatedTables: unknown[] = [];

// getSQL lets drizzle embed the chain as a subquery, so its condition shows up in the rendered delete
const chain = (result: unknown[], fields?: Record<string, unknown>) => {
    let from: unknown;
    let condition: unknown;
    const c: any = {
        from: (table: unknown) => {
            from = table;
            return c;
        },
        innerJoin: () => c,
        where: (cond: unknown) => {
            condition = cond;
            return c;
        },
        getSQL: () => sql`(select ${Object.values(fields ?? {})[0]} from ${from} where ${condition})`,
        then: (resolve: (v: unknown[]) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
    };
    return c;
};

const mockTx = {
    select: (fields?: Record<string, unknown>) => chain(selectQueue.shift() ?? [], fields),
    delete: (table: unknown) => {
        deletedTables.push(table);
        return {
            where: (condition: unknown) => {
                deleteWhere.push(condition);
                return Promise.resolve(undefined);
            },
        };
    },
    update: (table: unknown) => {
        updatedTables.push(table);
        return {set: () => ({where: () => Promise.resolve(undefined)})};
    },
};

const mocks = vi.hoisted(() => ({
    withRlsTransaction: vi.fn(),
    findSlackTeamId: vi.fn(),
    loadHandles: vi.fn(),
    insertSlackHandle: vi.fn(),
    listSlackChannels: vi.fn(),
    error: vi.fn(),
}));

vi.mock('@gitgazer/db/client', () => ({withRlsTransaction: mocks.withRlsTransaction}));
vi.mock('@/domains/apps/apps.controller', () => ({
    findSlackTeamId: mocks.findSlackTeamId,
    loadHandles: mocks.loadHandles,
    insertSlackHandle: mocks.insertSlackHandle,
    listSlackChannels: mocks.listSlackChannels,
}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => ({error: mocks.error, warn: vi.fn(), info: vi.fn(), debug: vi.fn()})}));

const base = {integrationId: 'int-1', integrationIds: ['int-1']};
const URL_T1 = 'https://hooks.slack.com/services/T111/B000/SECRETVALUE';

let move: typeof import('./slack-move');

describe('slack-move', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        selectQueue.length = 0;
        deletedTables.length = 0;
        deleteWhere.length = 0;
        updatedTables.length = 0;
        mocks.withRlsTransaction.mockImplementation(async (params: {callback: (tx: unknown) => unknown}) => params.callback(mockTx));
        mocks.listSlackChannels.mockResolvedValue([
            {id: 'C1', name: 'ops', isPrivate: false},
            {id: 'C2', name: 'dev', isPrivate: false},
        ]);
        mocks.insertSlackHandle.mockResolvedValue({handleId: 'slack-new'});
        move = await import('./slack-move');
    });

    describe('webhookTeamId', () => {
        it('parses the team and rejects other URLs', () => {
            expect(move.webhookTeamId(URL_T1)).toBe('T111');
            expect(move.webhookTeamId('https://example.com/services/T111/B000/X')).toBeNull();
            expect(move.webhookTeamId('http://hooks.slack.com/services/T111/B000/X')).toBeNull();
            expect(move.webhookTeamId('https://hooks.slack.com/workflows/T111/B000/X')).toBeNull();
        });
    });

    describe('listMoveCandidates', () => {
        it('excludes other workspaces and never returns the URL', async () => {
            mocks.findSlackTeamId.mockResolvedValue('T111');
            mocks.loadHandles.mockResolvedValue([
                {handleId: 'h1', name: 'mine', url: URL_T1, ruleCount: 2},
                {handleId: 'h2', name: 'other', url: 'https://hooks.slack.com/services/T999/B000/X', ruleCount: 1},
                {handleId: 'h3', name: '#ops', url: null, channelName: 'ops', ruleCount: 0},
            ]);

            const result = await move.listMoveCandidates(base);

            expect(result).toEqual([{handleId: 'h1', name: 'mine', ruleCount: 2}]);
            expect(JSON.stringify(result)).not.toContain('SECRETVALUE');
        });

        it('is empty without a Slack workspace', async () => {
            mocks.findSlackTeamId.mockResolvedValue(undefined);

            expect(await move.listMoveCandidates(base)).toEqual([]);
        });
    });

    describe('moveWebhookHandles', () => {
        // select order: slack app, then per move (webhook handle, existing slack handle, dedup subquery), finally remaining webhook handles
        const queueApp = () => selectQueue.push([{appId: 'app-s'}]);

        it('repoints rules and deletes the webhook handle', async () => {
            queueApp();
            selectQueue.push([{handleId: 'w1'}], [], [], [{count: 0}]);

            const result = await move.moveWebhookHandles({...base, moves: [{webhookHandleId: 'w1', channelId: 'C1'}]});

            expect(result).toEqual({moved: ['w1'], failed: [], webhookAppEmpty: true});
            expect(mocks.insertSlackHandle).toHaveBeenCalledWith(mockTx, {
                integrationId: 'int-1',
                appId: 'app-s',
                name: '#ops',
                channelId: 'C1',
                channelName: 'ops',
            });
            expect(updatedTables).toEqual([notificationRuleDestinations]);
            expect(deletedTables).toEqual([notificationRuleDestinations, notificationHandles]);
            expect(mocks.listSlackChannels).toHaveBeenCalledTimes(1);
        });

        it('a failing move leaves that handle untouched and others moved', async () => {
            queueApp();
            selectQueue.push([{handleId: 'w1'}], [], [{handleId: 'w2'}], [], [], [{count: 1}]);
            mocks.insertSlackHandle.mockRejectedValueOnce(new Error(`boom ${URL_T1}`)).mockResolvedValueOnce({handleId: 'slack-new'});

            const result = await move.moveWebhookHandles({
                ...base,
                moves: [
                    {webhookHandleId: 'w1', channelId: 'C1'},
                    {webhookHandleId: 'w2', channelId: 'C2'},
                ],
            });

            expect(result).toEqual({moved: ['w2'], failed: ['w1'], webhookAppEmpty: false});
            expect(mocks.withRlsTransaction).toHaveBeenCalledWith(expect.objectContaining({userName: 'gitgazer_writer'}));
            const logged = JSON.stringify(mocks.error.mock.calls);
            expect(logged).not.toContain('SECRETVALUE');
            expect(logged).toContain('Error');
        });

        it('reports an unknown handle or channel as failed', async () => {
            queueApp();
            selectQueue.push([], [{count: 2}]);

            const result = await move.moveWebhookHandles({
                ...base,
                moves: [
                    {webhookHandleId: 'gone', channelId: 'C1'},
                    {webhookHandleId: 'w2', channelId: 'C-unknown'},
                ],
            });

            expect(result).toEqual({moved: [], failed: ['gone', 'w2'], webhookAppEmpty: false});
            expect(mocks.insertSlackHandle).not.toHaveBeenCalled();
        });

        it('dedups a rule that already targets the channel', async () => {
            queueApp();
            selectQueue.push([{handleId: 'w1'}], [{handleId: 'slack-existing'}], [], [{count: 0}]);

            const result = await move.moveWebhookHandles({...base, moves: [{webhookHandleId: 'w1', channelId: 'C1'}]});

            expect(result.moved).toEqual(['w1']);
            expect(mocks.insertSlackHandle).not.toHaveBeenCalled();
            expect(deletedTables).toEqual([notificationRuleDestinations, notificationHandles]);
            expect(updatedTables).toEqual([notificationRuleDestinations]);

            const {sql: text, params} = new PgDialect().sqlToQuery(deleteWhere[0] as SQL);
            const col = (name: string) => `"gitgazer"."notification_rule_destinations"."${name}"`;
            expect(text).toBe(
                `((${col('integration_id')} = $1) and (${col('handle_id')} = $2) and (${col('rule_id')} in ` +
                    `((select ${col('rule_id')} from "gitgazer"."notification_rule_destinations" where ` +
                    `((${col('integration_id')} = $3) and (${col('handle_id')} = $4))))))`,
            );
            expect(params).toEqual(['int-1', 'w1', 'int-1', 'slack-existing']);
        });

        it('reports when the webhook app is empty', async () => {
            queueApp();
            selectQueue.push([{count: 0}]);

            expect((await move.moveWebhookHandles({...base, moves: []})).webhookAppEmpty).toBe(true);
        });
    });
});
