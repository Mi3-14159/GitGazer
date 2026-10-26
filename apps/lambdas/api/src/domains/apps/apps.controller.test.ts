import {BadRequestError, NotFoundError} from '@aws-lambda-powertools/event-handler/http';
import {integrationApps, notificationHandles, slackHandleDetails, slackWorkspaces} from '@gitgazer/db/schema/gitgazer';
import {githubAppInstallations} from '@gitgazer/db/schema/github/workflows';
import {MAX_SLACK_HANDLES, MAX_WEBHOOK_HANDLES} from '@gitgazer/db/types';
import type {SQL} from 'drizzle-orm';
import {PgDialect} from 'drizzle-orm/pg-core';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ConflictError} from '@/shared/errors';

const selectQueue: unknown[][] = [];
const deletedTables: unknown[] = [];
const insertedValues: {table: unknown; values: unknown}[] = [];
const orderByArgs: unknown[][] = [];
const queryLog: string[] = [];
const deleteWhere: unknown[] = [];
const deleteReturningQueue: unknown[][] = [];

const chain = (result: unknown[]) => {
    const c: any = {
        from: () => c,
        innerJoin: () => c,
        leftJoin: () => c,
        where: () => c,
        groupBy: () => c,
        orderBy: (...args: unknown[]) => {
            orderByArgs.push(args);
            return c;
        },
        for: (strength: string) => {
            queryLog.push(`for:${strength}`);
            return c;
        },
        then: (resolve: (v: unknown[]) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
    };
    return c;
};

const mockTx = {
    select: () => {
        queryLog.push('select');
        return chain(selectQueue.shift() ?? []);
    },
    insert: (table: unknown) => ({
        values: (values: unknown) => {
            insertedValues.push({table, values});
            const p: any = Promise.resolve(undefined);
            p.returning = () => Promise.resolve([{handleId: 'handle-new', appId: 'app-w', ...(values as object)}]);
            return p;
        },
    }),
    delete: (table: unknown) => {
        deletedTables.push(table);
        return {
            where: (condition: unknown) => {
                deleteWhere.push(condition);
                return Object.assign(Promise.resolve(undefined), {
                    returning: () => Promise.resolve(deleteReturningQueue.shift() ?? [{handleId: 'h-1'}]),
                });
            },
        };
    },
    update: () => ({set: () => ({where: () => Promise.resolve(undefined)})}),
};

const mockWithRlsTransaction = vi.fn();
vi.mock('@gitgazer/db/client', () => ({
    withRlsTransaction: (...args: unknown[]) => mockWithRlsTransaction(...args),
    db: {
        select: () => mockTx.select(),
        delete: (table: unknown) => mockTx.delete(table),
    },
}));

const mockGetGithubSettings = vi.fn();
const mockInstallGithubApp = vi.fn();
vi.mock('@/domains/apps/github-settings', () => ({
    getGithubSettings: (...args: unknown[]) => mockGetGithubSettings(...args),
    installGithubApp: (...args: unknown[]) => mockInstallGithubApp(...args),
}));

const mockUnlinkInstallation = vi.fn();
vi.mock('@/domains/github-app/unlink-installation', () => ({
    unlinkInstallation: (...args: unknown[]) => mockUnlinkInstallation(...args),
}));

const mockCreateEventLogEntry = vi.fn();
vi.mock('@gitgazer/backend-services/event-log.controller', () => ({
    createEventLogEntry: (...args: unknown[]) => mockCreateEventLogEntry(...args),
}));

const mockDecryptToken = vi.fn();
vi.mock('@gitgazer/backend-core/helpers/token-crypto', () => ({
    decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

const mockLoadWorkspaceForIntegration = vi.fn();
vi.mock('@gitgazer/backend-services/slack/workspaces', () => ({
    loadWorkspaceForIntegration: (...args: unknown[]) => mockLoadWorkspaceForIntegration(...args),
}));

const mockListChannels = vi.fn();
const mockRevokeToken = vi.fn();
vi.mock('@gitgazer/backend-core/clients/slack.client', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@gitgazer/backend-core/clients/slack.client')>()),
    listChannels: (...args: unknown[]) => mockListChannels(...args),
    revokeToken: (...args: unknown[]) => mockRevokeToken(...args),
}));

const BOT_TOKEN = 'xoxb-bot-token';
const SECRET = 's3cret-value';
const SLACK_URL = 'https://hooks.slack.com/services/T000/B000/XXXX';
const CREATED = new Date('2026-01-01T00:00:00Z');
const base = {integrationId: 'int-1', integrationIds: ['int-1']};

let controller: typeof import('./apps.controller');

describe('apps controller', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        selectQueue.length = 0;
        deletedTables.length = 0;
        insertedValues.length = 0;
        orderByArgs.length = 0;
        queryLog.length = 0;
        deleteWhere.length = 0;
        deleteReturningQueue.length = 0;
        mockDecryptToken.mockResolvedValue(BOT_TOKEN);
        mockLoadWorkspaceForIntegration.mockResolvedValue({teamId: 'T1', botToken: BOT_TOKEN, disconnected: false});
        mockListChannels.mockResolvedValue([{id: 'C1', name: 'ops', isPrivate: false}]);
        mockRevokeToken.mockResolvedValue(undefined);
        mockWithRlsTransaction.mockImplementation(async (params: {callback: (tx: unknown) => unknown}) => params.callback(mockTx));
        mockGetGithubSettings.mockResolvedValue({appId: 'app-g', secret: SECRET, orgSyncDefaultRole: 'member'});
        mockCreateEventLogEntry.mockResolvedValue({});
        controller = await import('./apps.controller');
    });

    const queueListData = () => {
        selectQueue.push(
            [
                {appId: 'app-g', type: 'github', createdAt: CREATED},
                {appId: 'app-w', type: 'webhook', createdAt: CREATED},
            ],
            [{handleId: 'h-1', appId: 'app-w', name: 'Team channel', url: SLACK_URL}],
            [{handleId: 'h-1', ruleCount: 2}],
        );
    };

    describe('listApps', () => {
        it('listApps hides secret and urls without canSeeSecrets', async () => {
            queueListData();

            const apps = await controller.listApps({...base, canSeeSecrets: false});

            const github = apps.find((a) => a.type === 'github');
            const webhook = apps.find((a) => a.type === 'webhook');
            expect(github?.type === 'github' && github.settings.secret).toBeNull();
            expect(webhook?.type === 'webhook' && webhook.handles.every((h) => h.url === null)).toBe(true);
            expect(webhook?.type === 'webhook' && webhook.handles.map((h) => h.name)).toEqual(['Team channel']);
            expect(JSON.stringify(apps)).not.toContain(SECRET);
            expect(JSON.stringify(apps)).not.toContain('hooks.slack.com');
        });

        it('listApps returns secret and urls with canSeeSecrets', async () => {
            queueListData();

            const apps = await controller.listApps({...base, canSeeSecrets: true});

            const github = apps.find((a) => a.type === 'github');
            const webhook = apps.find((a) => a.type === 'webhook');
            expect(github?.type === 'github' && github.settings.secret).toBe(SECRET);
            expect(webhook?.type === 'webhook' && webhook.handles[0]).toMatchObject({url: SLACK_URL, ruleCount: 2});
        });
    });

    describe('listApps (slack)', () => {
        it('returns the workspace, its channel handles and how many members are linked', async () => {
            selectQueue.push(
                [{appId: 'app-s', type: 'slack', createdAt: CREATED}],
                [{handleId: 'h-2', appId: 'app-s', name: '#ops', url: null, channelName: 'ops'}],
                [],
                [{teamId: 'T1'}],
                [{teamName: 'Acme', disconnectedAt: null}],
                [{githubId: 1}, {githubId: 2}, {githubId: null}],
                [{count: 1}],
            );

            const apps = await controller.listApps({...base, canSeeSecrets: false});

            expect(apps).toEqual([
                {
                    appId: 'app-s',
                    type: 'slack',
                    createdAt: CREATED.toISOString(),
                    workspace: {teamId: 'T1', teamName: 'Acme', disconnected: false},
                    handles: [{handleId: 'h-2', appId: 'app-s', name: '#ops', url: null, channelName: 'ops', ruleCount: 0}],
                    linkedMemberCount: 1,
                    memberCount: 3,
                },
            ]);
        });
    });

    describe('handle ordering', () => {
        it('orders handles by created_at, then name, then id so migrated handles list stably', async () => {
            queueListData();

            await controller.listApps({...base, canSeeSecrets: false});

            expect(orderByArgs[1]).toEqual([notificationHandles.createdAt, notificationHandles.name, notificationHandles.handleId]);
        });
    });

    describe('installApp', () => {
        it('installApp rejects a second app of the same type', async () => {
            selectQueue.push([{appId: 'app-g'}]);

            await expect(controller.installApp({...base, type: 'github'})).rejects.toBeInstanceOf(ConflictError);
            expect(mockInstallGithubApp).not.toHaveBeenCalled();
        });

        it('installApp rejects slack', async () => {
            await expect(controller.installApp({...base, type: 'slack'})).rejects.toThrow(new BadRequestError('Slack is installed through Slack'));
            expect(insertedValues).toHaveLength(0);
        });
    });

    describe('event log failures', () => {
        it('installApp still succeeds when the event log write fails', async () => {
            selectQueue.push([]);
            selectQueue.push([{appId: 'app-w', type: 'webhook', createdAt: CREATED}], [], []);
            mockCreateEventLogEntry.mockRejectedValue(new Error('db down'));

            await expect(controller.installApp({...base, type: 'webhook'})).resolves.toMatchObject({type: 'webhook'});
        });

        it('uninstallApp still succeeds when the event log write fails', async () => {
            selectQueue.push([{appId: 'app-w', type: 'webhook'}]);
            mockCreateEventLogEntry.mockRejectedValue(new Error('db down'));

            await expect(controller.uninstallApp({...base, appId: 'app-w'})).resolves.toBeUndefined();
            expect(deletedTables).toEqual([integrationApps]);
        });
    });

    describe('uninstallApp', () => {
        it('uninstallApp(github) unlinks every installation and deletes the app', async () => {
            selectQueue.push([{appId: 'app-g', type: 'github'}], [{installationId: 1}, {installationId: 2}]);

            await controller.uninstallApp({...base, appId: 'app-g'});

            expect(mockUnlinkInstallation).toHaveBeenCalledTimes(2);
            expect(mockUnlinkInstallation).toHaveBeenCalledWith('int-1', 1);
            expect(mockUnlinkInstallation).toHaveBeenCalledWith('int-1', 2);
            expect(deletedTables).toEqual([integrationApps]);
            expect(deletedTables).not.toContain(githubAppInstallations);
            expect(mockCreateEventLogEntry).toHaveBeenCalledWith(expect.objectContaining({integrationId: 'int-1', category: 'integration'}));
        });

        it('uninstallApp(github) re-checks under a settings lock and unlinks an installation linked after the snapshot', async () => {
            selectQueue.push([{appId: 'app-g', type: 'github'}], [{installationId: 1}], [{installationId: 3}], []);

            await controller.uninstallApp({...base, appId: 'app-g'});

            expect(mockUnlinkInstallation.mock.calls).toEqual([
                ['int-1', 1],
                ['int-1', 3],
            ]);
            expect(mockGetGithubSettings).toHaveBeenCalledTimes(2);
            expect(mockGetGithubSettings).toHaveBeenCalledWith(mockTx, 'int-1', 'update');
            expect(deletedTables).toEqual([integrationApps]);
        });

        it('uninstallApp(github) fails instead of deleting while installations keep being linked', async () => {
            selectQueue.push(
                [{appId: 'app-g', type: 'github'}],
                [{installationId: 1}],
                [{installationId: 2}],
                [{installationId: 3}],
                [{installationId: 4}],
            );

            await expect(controller.uninstallApp({...base, appId: 'app-g'})).rejects.toBeInstanceOf(ConflictError);
            expect(deletedTables).toEqual([]);
            expect(mockUnlinkInstallation.mock.calls.map(([, id]) => id)).toEqual([1, 2, 3]);
            expect(mockCreateEventLogEntry).not.toHaveBeenCalled();
        });
    });

    describe('uninstallApp (slack)', () => {
        const releaseCondition = () => {
            const {sql} = new PgDialect().sqlToQuery(deleteWhere[1] as SQL);
            return sql;
        };

        it('uninstall keeps the token while another integration uses the workspace', async () => {
            selectQueue.push([{appId: 'app-s', type: 'slack'}], [{teamId: 'T1'}]);
            deleteReturningQueue.push([]);

            await controller.uninstallApp({...base, appId: 'app-s'});

            expect(deletedTables).toEqual([integrationApps, slackWorkspaces]);
            expect(releaseCondition()).toContain('not exists (select 1 from "gitgazer"."integration_app_slack_settings"');
            expect(mockRevokeToken).not.toHaveBeenCalled();
        });

        it('uninstall revokes and deletes the workspace when it was the last', async () => {
            selectQueue.push([{appId: 'app-s', type: 'slack'}], [{teamId: 'T1'}]);
            deleteReturningQueue.push([{botTokenCiphertext: 'cipher'}]);

            await controller.uninstallApp({...base, appId: 'app-s'});

            expect(deletedTables).toEqual([integrationApps, slackWorkspaces]);
            expect(mockDecryptToken).toHaveBeenCalledWith('cipher');
            expect(mockRevokeToken).toHaveBeenCalledWith(BOT_TOKEN);
        });

        it('uninstall still succeeds when revoking the token fails', async () => {
            selectQueue.push([{appId: 'app-s', type: 'slack'}], [{teamId: 'T1'}]);
            deleteReturningQueue.push([{botTokenCiphertext: 'cipher'}]);
            mockRevokeToken.mockRejectedValue(new Error('slack down'));

            await expect(controller.uninstallApp({...base, appId: 'app-s'})).resolves.toBeUndefined();
        });
    });

    describe('Slack channels and handles', () => {
        const queueSlackApp = () => selectQueue.push([{appId: 'app-s', type: 'slack'}]);

        it('listSlackChannels lists the channels with the workspace bot token', async () => {
            queueSlackApp();

            await expect(controller.listSlackChannels({...base, appId: 'app-s'})).resolves.toEqual([{id: 'C1', name: 'ops', isPrivate: false}]);
            expect(mockLoadWorkspaceForIntegration).toHaveBeenCalledWith('int-1');
            expect(mockListChannels).toHaveBeenCalledWith(BOT_TOKEN);
        });

        it('listSlackChannels rejects a non-Slack app', async () => {
            selectQueue.push([{appId: 'app-w', type: 'webhook'}]);

            await expect(controller.listSlackChannels({...base, appId: 'app-w'})).rejects.toBeInstanceOf(BadRequestError);
            expect(mockListChannels).not.toHaveBeenCalled();
        });

        it('listSlackChannels fails without a workspace', async () => {
            queueSlackApp();
            mockLoadWorkspaceForIntegration.mockResolvedValue(null);

            await expect(controller.listSlackChannels({...base, appId: 'app-s'})).rejects.toBeInstanceOf(NotFoundError);
            expect(mockListChannels).not.toHaveBeenCalled();
        });

        it('createHandle rejects an unknown channel', async () => {
            queueSlackApp();

            await expect(controller.createHandle({...base, appId: 'app-s', channelId: 'C9'})).rejects.toBeInstanceOf(BadRequestError);
            expect(insertedValues).toHaveLength(0);
        });

        it('createHandle names the handle after the channel', async () => {
            queueSlackApp();
            selectQueue.push([{appId: 'app-s', type: 'slack'}], [{count: 0}]);

            const handle = await controller.createHandle({...base, appId: 'app-s', channelId: 'C1'});

            expect(insertedValues.find((i) => i.table === notificationHandles)?.values).toMatchObject({name: '#ops', appId: 'app-s'});
            expect(insertedValues.find((i) => i.table === slackHandleDetails)?.values).toEqual({
                integrationId: 'int-1',
                handleId: 'handle-new',
                channelId: 'C1',
                channelName: 'ops',
            });
            expect(handle).toEqual({handleId: 'handle-new', appId: 'app-s', name: '#ops', url: null, channelName: 'ops', ruleCount: 0});
        });

        it('createHandle keeps a given name for a channel handle', async () => {
            queueSlackApp();
            selectQueue.push([{appId: 'app-s', type: 'slack'}], [{count: 0}]);

            const handle = await controller.createHandle({...base, appId: 'app-s', channelId: 'C1', name: ' Alerts '});

            expect(handle.name).toBe('Alerts');
        });

        it('createHandle rejects a channel handle beyond the maximum', async () => {
            queueSlackApp();
            selectQueue.push([{appId: 'app-s', type: 'slack'}], [{count: MAX_SLACK_HANDLES}]);

            await expect(controller.createHandle({...base, appId: 'app-s', channelId: 'C1'})).rejects.toThrow(
                `A Slack app holds at most ${MAX_SLACK_HANDLES} handles`,
            );
            expect(insertedValues).toHaveLength(0);
        });

        it('updateHandle only renames a channel handle', async () => {
            selectQueue.push([{handleId: 'h-2', appId: 'app-s', name: '#ops', url: null, channelName: 'ops'}], []);

            await expect(controller.updateHandle({...base, handleId: 'h-2', url: SLACK_URL})).rejects.toBeInstanceOf(BadRequestError);
        });
    });

    describe('createHandle', () => {
        it('createHandle rejects a non-Slack url', async () => {
            await expect(controller.createHandle({...base, appId: 'app-w', name: 'x', url: 'https://example.com/x'})).rejects.toBeInstanceOf(
                BadRequestError,
            );
            expect(insertedValues).toHaveLength(0);
        });

        it('createHandle rejects the 21st handle', async () => {
            selectQueue.push([{appId: 'app-w', type: 'webhook'}], [{count: MAX_WEBHOOK_HANDLES}]);

            await expect(controller.createHandle({...base, appId: 'app-w', name: 'x', url: SLACK_URL})).rejects.toThrow(
                'A Webhook app holds at most 20 handles',
            );
            expect(insertedValues).toHaveLength(0);
        });

        it('createHandle rejects a handle on the github app', async () => {
            selectQueue.push([{appId: 'app-g', type: 'github'}]);

            await expect(controller.createHandle({...base, appId: 'app-g', name: 'x', url: SLACK_URL})).rejects.toBeInstanceOf(BadRequestError);
            expect(insertedValues).toHaveLength(0);
        });

        it('createHandle locks the Webhook app row before counting its handles', async () => {
            selectQueue.push([{appId: 'app-w', type: 'webhook'}], [{count: 0}]);

            await controller.createHandle({...base, appId: 'app-w', name: 'x', url: SLACK_URL});

            expect(queryLog).toEqual(['select', 'for:update', 'select']);
        });

        it('createHandle stores the trimmed name and the url', async () => {
            selectQueue.push([{appId: 'app-w', type: 'webhook'}], [{count: 0}]);

            const handle = await controller.createHandle({...base, appId: 'app-w', name: '  Team  ', url: SLACK_URL});

            expect(insertedValues.find((i) => i.table === notificationHandles)?.values).toMatchObject({name: 'Team', appId: 'app-w'});
            expect(handle).toMatchObject({handleId: 'handle-new', name: 'Team', url: SLACK_URL, ruleCount: 0});
        });
    });

    describe('deleteHandle', () => {
        it('deletes the handle row only', async () => {
            await controller.deleteHandle({...base, handleId: 'h-1'});

            expect(deletedTables).toEqual([notificationHandles]);
        });
    });
});
