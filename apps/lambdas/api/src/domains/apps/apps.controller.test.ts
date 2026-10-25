import {BadRequestError} from '@aws-lambda-powertools/event-handler/http';
import {integrationApps, notificationHandles} from '@gitgazer/db/schema/gitgazer';
import {githubAppInstallations} from '@gitgazer/db/schema/github/workflows';
import {MAX_WEBHOOK_HANDLES} from '@gitgazer/db/types';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ConflictError} from '@/shared/errors';

const selectQueue: unknown[][] = [];
const deletedTables: unknown[] = [];
const insertedValues: {table: unknown; values: unknown}[] = [];

const chain = (result: unknown[]) => {
    const c: any = {
        from: () => c,
        innerJoin: () => c,
        leftJoin: () => c,
        where: () => c,
        groupBy: () => c,
        orderBy: () => c,
        for: () => c,
        then: (resolve: (v: unknown[]) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
    };
    return c;
};

const mockTx = {
    select: () => chain(selectQueue.shift() ?? []),
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
        return {where: () => Object.assign(Promise.resolve(undefined), {returning: () => Promise.resolve([{handleId: 'h-1'}])})};
    },
    update: () => ({set: () => ({where: () => Promise.resolve(undefined)})}),
};

const mockWithRlsTransaction = vi.fn();
vi.mock('@gitgazer/db/client', () => ({
    withRlsTransaction: (...args: unknown[]) => mockWithRlsTransaction(...args),
    db: {},
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

    describe('installApp', () => {
        it('installApp rejects a second app of the same type', async () => {
            selectQueue.push([{appId: 'app-g'}]);

            await expect(controller.installApp({...base, type: 'github'})).rejects.toBeInstanceOf(ConflictError);
            expect(mockInstallGithubApp).not.toHaveBeenCalled();
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
