import type {WorkflowJobWithRelations} from '@gitgazer/db/types';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const logger = vi.hoisted(() => ({debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => logger}));

const tables = vi.hoisted(() => ({
    notificationRules: {
        integrationId: 'integration_id',
        id: 'id',
        include_log_details: 'include_log_details',
        enabled: 'enabled',
        rule: 'rule',
        ignore_dependabot: 'ignore_dependabot',
    },
    notificationRuleDestinations: {integrationId: 'integration_id', ruleId: 'rule_id', handleId: 'handle_id'},
    webhookHandleDetails: {integrationId: 'integration_id', handleId: 'handle_id', url: 'url'},
    slackHandleDetails: {integrationId: 'integration_id', handleId: 'handle_id', channelId: 'channel_id'},
    githubAppInstallations: {installationId: 'installation_id', integrationId: 'integration_id', accountLogin: 'account_login'},
    workflowRunPullRequests: {integrationId: 'integration_id', workflowRunId: 'workflow_run_id', pullRequestId: 'pull_request_id'},
    pullRequests: {integrationId: 'integration_id', id: 'id', number: 'number', title: 'title'},
}));
vi.mock('@gitgazer/db/schema', () => tables);

const rowsByTable = new Map<object, unknown[]>();
// Set to make the single rules+handles read return exactly these rows, ignoring the per-table fixtures.
let joinedRows: unknown[] | null = null;
const readTables: object[] = [];

type JoinedRow = {ruleId: string; includeLogDetails: boolean; handleId: string | null; url: string | null; channelId: string | null};

// Mirrors notification_rules LEFT JOIN destinations LEFT JOIN webhook/slack handle details: a rule without a (live) handle yields one row with null handle.
const joinRulesAndDestinations = (): unknown[] => {
    if (joinedRows) return joinedRows;
    const rules = (rowsByTable.get(tables.notificationRules) ?? []) as {id: string; include_log_details: boolean}[];
    const destinations = (rowsByTable.get(tables.notificationRuleDestinations) ?? []) as Omit<JoinedRow, 'includeLogDetails'>[];
    return rules.flatMap((r): JoinedRow[] => {
        const own = destinations.filter((d) => d.ruleId === r.id);
        return own.length === 0
            ? [{ruleId: r.id, includeLogDetails: r.include_log_details, handleId: null, url: null, channelId: null}]
            : own.map((d) => ({...d, includeLogDetails: r.include_log_details}));
    });
};
const fakeTx = {
    select: () => {
        let table: object;
        const builder: Record<string, unknown> = {
            from: (t: object) => {
                table = t;
                readTables.push(t);
                return builder;
            },
            innerJoin: () => builder,
            leftJoin: () => builder,
            where: () => builder,
            orderBy: () => builder,
            limit: () => builder,
            then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
                Promise.resolve(table === tables.notificationRules ? joinRulesAndDestinations() : (rowsByTable.get(table) ?? [])).then(
                    resolve,
                    reject,
                ),
        };
        return builder;
    },
};
const mockWithRlsTransaction = vi.fn();
vi.mock('@gitgazer/db/client', () => ({
    withRlsTransaction: (...args: any[]) => mockWithRlsTransaction(...args),
}));

const mockComputeVerdict = vi.fn();
vi.mock('./alerting/verdict', () => ({
    computeVerdict: (...args: any[]) => mockComputeVerdict(...args),
}));

const mockSummarizeFailure = vi.fn();
vi.mock('./alerting/summary', () => ({
    summarizeFailure: (...args: any[]) => mockSummarizeFailure(...args),
}));

const mockDownloadJobLog = vi.fn();
vi.mock('@gitgazer/backend-core/clients/github-app.client', () => ({
    downloadJobLog: (...args: any[]) => mockDownloadJobLog(...args),
}));

const mockProxyFetch = vi.fn();
vi.mock('@gitgazer/backend-core/clients/proxy-fetch', () => ({
    proxyFetch: (...args: any[]) => mockProxyFetch(...args),
}));

const mockLoadWorkspaceForIntegration = vi.fn();
const mockMarkWorkspaceDisconnected = vi.fn();
vi.mock('./slack/workspaces', () => ({
    loadWorkspaceForIntegration: (...args: any[]) => mockLoadWorkspaceForIntegration(...args),
    markWorkspaceDisconnected: (...args: any[]) => mockMarkWorkspaceDisconnected(...args),
}));

const mockResolveSlackUserId = vi.fn();
vi.mock('./slack/links', () => ({
    resolveSlackUserId: (...args: any[]) => mockResolveSlackUserId(...args),
}));

const mockPostMessage = vi.fn();
vi.mock('@gitgazer/backend-core/clients/slack.client', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@gitgazer/backend-core/clients/slack.client')>()),
    postMessage: (...args: any[]) => mockPostMessage(...args),
}));

const mockCreateEventLogEntry = vi.fn();
vi.mock('./event-log.controller', () => ({
    createEventLogEntry: (...args: any[]) => mockCreateEventLogEntry(...args),
}));

vi.mock('@gitgazer/backend-core/config', () => ({
    default: {get: () => ({logFetchTimeoutMs: 5000, minRemainingMsForEnrichment: 30000})},
}));

const spies = vi.hoisted(() => ({loadLogDetails: vi.fn(), buildSlackAlert: vi.fn()}));
vi.mock('./alerting/log-details', async (importOriginal) => {
    const original = await importOriginal<typeof import('./alerting/log-details')>();
    spies.loadLogDetails.mockImplementation(original.loadLogDetails);
    return {...original, loadLogDetails: spies.loadLogDetails};
});
vi.mock('./alerting/slack-payload', async (importOriginal) => {
    const original = await importOriginal<typeof import('./alerting/slack-payload')>();
    spies.buildSlackAlert.mockImplementation(original.buildSlackAlert);
    return {...original, buildSlackAlert: spies.buildSlackAlert};
});

import {sendWorkflowJobAlerts} from './alerting.controller';
import {SlackApiError} from '@gitgazer/backend-core/clients/slack.client';

const LOG = ['##[group]Run pnpm test', 'FAIL checkout.spec.ts', '##[error]Process completed with exit code 1.'].join('\n');
const SUMMARY = 'Checkout tests time out waiting for the pay button.';

const job = {
    id: 99,
    integrationId: 'int-1',
    repositoryId: 7,
    workflowRunId: 555,
    runId: 555,
    runAttempt: 1,
    status: 'completed',
    conclusion: 'failure',
    workflowName: 'CI',
    name: 'test',
    headBranch: 'main',
    repository: {name: 'app', owner: {login: 'acme'}, topics: [], defaultBranch: 'main'},
    sender: {id: 5, login: 'asmith', type: 'User'},
    workflowRun: {event: 'push', headCommitMessage: 'fix cart'},
} as unknown as WorkflowJobWithRelations;

const rule = (id: string, includeLogDetails: boolean) => ({id, include_log_details: includeLogDetails});

// Mirrors the destinations -> handle details joins: one row per (rule, handle) with the handle's URL or channel.
const destination = (ruleId: string, handleId: string, url = `https://hooks.slack.com/${handleId}`) => ({ruleId, handleId, url, channelId: null});
const slackDestination = (ruleId: string, handleId: string, channelId = `C-${handleId}`) => ({ruleId, handleId, url: null, channelId});
const setDestinations = (...rows: Omit<JoinedRow, 'includeLogDetails'>[]) => rowsByTable.set(tables.notificationRuleDestinations, rows);

const postedBodies = (): string[] => mockProxyFetch.mock.calls.map(([, init]) => init.body as string);
const slackInputs = () => spies.buildSlackAlert.mock.calls.map(([input]) => input);
const postedChannels = (): string[] => mockPostMessage.mock.calls.map(([, channelId]) => channelId);
const disconnectEntries = () => mockCreateEventLogEntry.mock.calls.filter(([entry]) => entry.title === 'Slack app disconnected');

describe('sendWorkflowJobAlerts', () => {
    beforeEach(() => {
        rowsByTable.clear();
        joinedRows = null;
        readTables.length = 0;
        mockWithRlsTransaction.mockReset();
        mockWithRlsTransaction.mockImplementation(async (p: {callback: (tx: typeof fakeTx) => unknown}) => p.callback(fakeTx));
        mockComputeVerdict.mockResolvedValue({kind: 'flaky', evidence: 'failed 4 of last 30 runs; 3 passed on rerun'});
        mockSummarizeFailure.mockResolvedValue(SUMMARY);
        mockDownloadJobLog.mockResolvedValue(LOG);
        mockProxyFetch.mockResolvedValue({ok: true, status: 200});
        mockCreateEventLogEntry.mockReset();
        mockCreateEventLogEntry.mockResolvedValue(undefined);
        mockLoadWorkspaceForIntegration.mockReset();
        mockLoadWorkspaceForIntegration.mockResolvedValue({teamId: 'T1', botToken: 'xoxb-secret', disconnected: false});
        mockMarkWorkspaceDisconnected.mockReset();
        mockMarkWorkspaceDisconnected.mockResolvedValue([]);
        mockResolveSlackUserId.mockReset();
        mockResolveSlackUserId.mockResolvedValue('U123');
        mockPostMessage.mockReset();
        mockPostMessage.mockResolvedValue(undefined);
        rowsByTable.set(tables.notificationRules, [rule('rule-1', true)]);
        setDestinations(destination('rule-1', 'a'));
        rowsByTable.set(tables.githubAppInstallations, [{installationId: 123}]);
    });

    it('skips non-failures', async () => {
        await sendWorkflowJobAlerts({...job, conclusion: 'success'} as WorkflowJobWithRelations);

        expect(mockWithRlsTransaction).not.toHaveBeenCalled();
        expect(mockComputeVerdict).not.toHaveBeenCalled();
        expect(mockProxyFetch).not.toHaveBeenCalled();
    });

    it('sends a full alert with summary and excerpt for an opted-in GitHub App integration', async () => {
        await sendWorkflowJobAlerts(job);

        expect(mockDownloadJobLog).toHaveBeenCalledWith(123, 'acme', 'app', 99);
        expect(postedBodies()).toHaveLength(1);
        expect(postedBodies()[0]).toContain(SUMMARY);
        expect(postedBodies()[0]).toContain('Process completed with exit code 1.');
    });

    it('manual-webhook integration sends verdict-only and never downloads logs', async () => {
        rowsByTable.set(tables.githubAppInstallations, []);

        await sendWorkflowJobAlerts(job);

        expect(mockDownloadJobLog).not.toHaveBeenCalled();
        expect(mockSummarizeFailure).not.toHaveBeenCalled();
        expect(slackInputs()).toEqual([expect.objectContaining({verdict: {kind: 'flaky', evidence: expect.any(String)}, details: null})]);
        expect(postedBodies()[0]).toContain('Probably flaky');
    });

    it('omits details for rules that opted out', async () => {
        rowsByTable.set(tables.notificationRules, [rule('rule-in', true), rule('rule-out', false)]);
        setDestinations(destination('rule-in', 'in'), destination('rule-out', 'out'));

        await sendWorkflowJobAlerts(job);

        expect(spies.loadLogDetails).toHaveBeenCalledTimes(1);
        const byUrl = Object.fromEntries(mockProxyFetch.mock.calls.map(([url, init]) => [url, init.body as string]));
        expect(byUrl['https://hooks.slack.com/in']).toContain(SUMMARY);
        expect(byUrl['https://hooks.slack.com/out']).not.toContain(SUMMARY);
        expect(byUrl['https://hooks.slack.com/out']).not.toContain('Process completed');
    });

    it('does not fetch logs when no matching rule opted in', async () => {
        rowsByTable.set(tables.notificationRules, [rule('rule-out', false)]);
        setDestinations(destination('rule-out', 'out'));

        await sendWorkflowJobAlerts(job);

        expect(spies.loadLogDetails).not.toHaveBeenCalled();
        expect(mockDownloadJobLog).not.toHaveBeenCalled();
        expect(mockProxyFetch).toHaveBeenCalledTimes(1);
    });

    it('skips enrichment when remaining time is below 30s', async () => {
        await sendWorkflowJobAlerts(job, {getRemainingTimeMs: () => 29_999});

        expect(spies.loadLogDetails).not.toHaveBeenCalled();
        expect(mockDownloadJobLog).not.toHaveBeenCalled();
        expect(slackInputs()).toEqual([expect.objectContaining({details: null})]);
        expect(mockProxyFetch).toHaveBeenCalledTimes(1);
    });

    it('enriches when exactly the minimum time remains', async () => {
        await sendWorkflowJobAlerts(job, {getRemainingTimeMs: () => 30_000});

        expect(spies.loadLogDetails).toHaveBeenCalledTimes(1);
    });

    it('falls back to verdict-only when the log download fails', async () => {
        mockDownloadJobLog.mockRejectedValue(Object.assign(new Error('Resource not accessible by integration'), {status: 403}));

        await sendWorkflowJobAlerts(job);

        expect(mockSummarizeFailure).not.toHaveBeenCalled();
        expect(slackInputs()).toEqual([expect.objectContaining({details: null})]);
        expect(mockProxyFetch).toHaveBeenCalledTimes(1);
        expect(mockCreateEventLogEntry).toHaveBeenCalledWith(expect.objectContaining({metadata: expect.objectContaining({aiSummary: false})}));
    });

    it('records verdict and aiSummary in the event log', async () => {
        await sendWorkflowJobAlerts(job);

        expect(mockCreateEventLogEntry).toHaveBeenCalledWith(
            expect.objectContaining({
                integrationId: 'int-1',
                category: 'notification',
                type: 'alert',
                metadata: expect.objectContaining({verdict: 'flaky', aiSummary: true, workflowJobId: 99}),
            }),
        );
    });

    it('records aiSummary false when no summary was produced', async () => {
        mockSummarizeFailure.mockResolvedValue(null);

        await sendWorkflowJobAlerts(job);

        expect(mockCreateEventLogEntry).toHaveBeenCalledWith(expect.objectContaining({metadata: expect.objectContaining({aiSummary: false})}));
        expect(postedBodies()[0]).toContain('Process completed with exit code 1.');
    });

    it('verdict-only alert still carries the PR link', async () => {
        rowsByTable.set(tables.githubAppInstallations, []);
        rowsByTable.set(tables.workflowRunPullRequests, [{number: 42, title: 'Fix cart'}]);

        await sendWorkflowJobAlerts(job);

        expect(slackInputs()).toEqual([expect.objectContaining({pullRequestNumber: 42, details: null})]);
        expect(postedBodies()[0]).toContain('https://github.com/acme/app/pull/42');
    });

    it('a Slack post failure for one channel does not stop the others', async () => {
        rowsByTable.set(tables.notificationRules, [rule('rule-1', true)]);
        setDestinations(destination('rule-1', 'a'), destination('rule-1', 'b'));
        mockProxyFetch.mockRejectedValueOnce(new Error('ECONNRESET'));

        await sendWorkflowJobAlerts(job);

        expect(mockProxyFetch.mock.calls.map(([url]) => url)).toEqual(['https://hooks.slack.com/a', 'https://hooks.slack.com/b']);
        expect(mockCreateEventLogEntry).toHaveBeenCalledTimes(1);
    });

    it('posts once per handle when two matching rules share it', async () => {
        rowsByTable.set(tables.notificationRules, [rule('rule-1', true), rule('rule-2', true)]);
        setDestinations(destination('rule-1', 'shared'), destination('rule-2', 'shared'));

        await sendWorkflowJobAlerts(job);

        expect(mockProxyFetch).toHaveBeenCalledTimes(1);
        expect(mockProxyFetch.mock.calls[0][0]).toBe('https://hooks.slack.com/shared');
    });

    it('includes details for a shared handle if any of its rules opted in', async () => {
        rowsByTable.set(tables.notificationRules, [rule('rule-out', false), rule('rule-in', true)]);
        setDestinations(destination('rule-out', 'shared'), destination('rule-in', 'shared'));

        await sendWorkflowJobAlerts(job);

        expect(mockProxyFetch).toHaveBeenCalledTimes(1);
        expect(postedBodies()[0]).toContain(SUMMARY);
    });

    it('takes handles and the details flag from the same read as the matching rules', async () => {
        // A second read of destinations would find this stale pairing (rule-A -> handle-A with details) and must not be used.
        rowsByTable.set(tables.notificationRules, [rule('rule-A', true)]);
        setDestinations(destination('rule-A', 'handle-A'));
        joinedRows = [{ruleId: 'rule-A', includeLogDetails: false, handleId: 'handle-B', url: 'https://hooks.slack.com/handle-B', channelId: null}];

        await sendWorkflowJobAlerts(job);

        expect(readTables.filter((table) => table === tables.notificationRules)).toHaveLength(1);
        expect(readTables).not.toContain(tables.notificationRuleDestinations);
        expect(readTables).not.toContain(tables.webhookHandleDetails);
        expect(readTables).not.toContain(tables.slackHandleDetails);
        expect(mockProxyFetch.mock.calls.map(([url]) => url)).toEqual(['https://hooks.slack.com/handle-B']);
        expect(spies.loadLogDetails).not.toHaveBeenCalled();
        expect(slackInputs()).toEqual([expect.objectContaining({details: null})]);
    });

    it('a rule without destinations sends nothing and does not throw', async () => {
        setDestinations();

        await expect(sendWorkflowJobAlerts(job)).resolves.toBeUndefined();

        expect(mockProxyFetch).not.toHaveBeenCalled();
        expect(mockCreateEventLogEntry).toHaveBeenCalledTimes(1);
    });

    it('skips the log download and summary when no handle would receive the alert', async () => {
        setDestinations();

        await sendWorkflowJobAlerts(job);

        expect(spies.loadLogDetails).not.toHaveBeenCalled();
        expect(mockDownloadJobLog).not.toHaveBeenCalled();
        expect(mockSummarizeFailure).not.toHaveBeenCalled();
        expect(mockCreateEventLogEntry).toHaveBeenCalledWith(expect.objectContaining({metadata: expect.objectContaining({aiSummary: false})}));
    });

    it('does not fetch logs when only an opted-in rule without destinations wants details', async () => {
        rowsByTable.set(tables.notificationRules, [rule('rule-in', true), rule('rule-out', false)]);
        setDestinations(destination('rule-out', 'out'));

        await sendWorkflowJobAlerts(job);

        expect(spies.loadLogDetails).not.toHaveBeenCalled();
        expect(mockDownloadJobLog).not.toHaveBeenCalled();
        expect(slackInputs()).toEqual([expect.objectContaining({details: null})]);
        expect(mockProxyFetch).toHaveBeenCalledTimes(1);
    });

    it('logs the handle id and never the URL', async () => {
        mockProxyFetch.mockRejectedValueOnce(new Error('ECONNRESET'));

        await sendWorkflowJobAlerts(job);

        const logged = [logger.info, logger.error].flatMap((level) => level.mock.calls);
        expect(logged).toContainEqual([expect.any(String), expect.objectContaining({handleId: 'a'})]);
        expect(JSON.stringify(logged.map(([message, attributes]) => [message, {...attributes, error: undefined}]))).not.toContain('hooks.slack.com');
    });

    // Alerts run while the worker ingests other records, so shared logger keys cannot identify the job.
    it('passes the job ids with every log line', async () => {
        rowsByTable.set(tables.notificationRules, [rule('rule-1', true)]);
        setDestinations(destination('rule-1', 'a'), destination('rule-1', 'b'), slackDestination('rule-1', 's1'), slackDestination('rule-1', 's2'));
        mockProxyFetch.mockRejectedValueOnce(new Error('ECONNRESET'));
        mockPostMessage.mockRejectedValueOnce(new SlackApiError('channel_not_found')).mockRejectedValueOnce(new SlackApiError('token_revoked'));
        mockMarkWorkspaceDisconnected.mockResolvedValue(['int-1', 'int-2']);
        mockCreateEventLogEntry.mockRejectedValue(new Error('db down'));

        await sendWorkflowJobAlerts(job);
        mockMarkWorkspaceDisconnected.mockRejectedValue(new Error('db down'));
        mockPostMessage.mockRejectedValueOnce(new SlackApiError('token_revoked'));
        await sendWorkflowJobAlerts(job);
        mockLoadWorkspaceForIntegration.mockResolvedValue({teamId: 'T1', botToken: 'xoxb-secret', disconnected: true});
        await sendWorkflowJobAlerts(job);
        mockLoadWorkspaceForIntegration.mockRejectedValue(new Error('kms down'));
        await sendWorkflowJobAlerts(job);
        rowsByTable.set(tables.notificationRules, []);
        await sendWorkflowJobAlerts(job);

        const logged = [logger.debug, logger.info, logger.warn, logger.error].flatMap((level) => level.mock.calls);
        expect(logged.length).toBeGreaterThan(3);
        for (const [message, attributes] of logged) {
            expect(attributes, String(message)).toMatchObject({integrationId: 'int-1', jobId: 99});
        }
    });

    it('posts the payload built by buildSlackAlert', async () => {
        await sendWorkflowJobAlerts(job);

        const actual = await vi.importActual<typeof import('./alerting/slack-payload')>('./alerting/slack-payload');
        expect(JSON.parse(postedBodies()[0])).toEqual(actual.buildSlackAlert(slackInputs()[0]));
    });

    describe('Slack app handles', () => {
        it('mentions only on Slack handles', async () => {
            setDestinations(destination('rule-1', 'a'), slackDestination('rule-1', 's'));

            await sendWorkflowJobAlerts(job);

            expect(mockResolveSlackUserId).toHaveBeenCalledTimes(1);
            expect(mockResolveSlackUserId).toHaveBeenCalledWith(
                expect.objectContaining({
                    teamId: 'T1',
                    botToken: 'xoxb-secret',
                    integrationId: 'int-1',
                    githubUserId: 5,
                    githubLogin: 'asmith',
                    ownerLogin: 'acme',
                }),
            );
            expect(slackInputs()).toEqual([expect.objectContaining({senderSlackUserId: null}), expect.objectContaining({senderSlackUserId: 'U123'})]);
            expect(postedBodies()[0]).not.toContain('<@U123>');
            expect(JSON.stringify(mockPostMessage.mock.calls[0][2])).toContain('<@U123>');
        });

        it('does not load the workspace or look up the sender without Slack handles', async () => {
            await sendWorkflowJobAlerts(job);

            expect(mockLoadWorkspaceForIntegration).not.toHaveBeenCalled();
            expect(mockResolveSlackUserId).not.toHaveBeenCalled();
            expect(slackInputs()).toEqual([expect.objectContaining({senderSlackUserId: null})]);
        });

        it('posts Slack handles with the bot token to the channel', async () => {
            setDestinations(slackDestination('rule-1', 's1', 'C1'), slackDestination('rule-1', 's2', 'C2'));

            await sendWorkflowJobAlerts(job);

            expect(mockLoadWorkspaceForIntegration).toHaveBeenCalledTimes(1);
            expect(mockLoadWorkspaceForIntegration).toHaveBeenCalledWith('int-1');
            expect(mockProxyFetch).not.toHaveBeenCalled();
            expect(mockPostMessage.mock.calls.map(([token, channel]) => [token, channel])).toEqual([
                ['xoxb-secret', 'C1'],
                ['xoxb-secret', 'C2'],
            ]);
            const actual = await vi.importActual<typeof import('./alerting/slack-payload')>('./alerting/slack-payload');
            expect(mockPostMessage.mock.calls[0][2]).toEqual(actual.buildSlackAlert(slackInputs()[0]));
        });

        it('bot sender is not looked up', async () => {
            setDestinations(slackDestination('rule-1', 's'));

            await sendWorkflowJobAlerts({...job, sender: {id: 6, login: 'dependabot[bot]', type: 'Bot'}} as WorkflowJobWithRelations);

            expect(mockResolveSlackUserId).not.toHaveBeenCalled();
            expect(slackInputs()).toEqual([expect.objectContaining({senderSlackUserId: null})]);
            expect(mockPostMessage).toHaveBeenCalledTimes(1);
        });

        it('missing sender is not looked up', async () => {
            setDestinations(slackDestination('rule-1', 's'));

            await sendWorkflowJobAlerts({...job, sender: null} as unknown as WorkflowJobWithRelations);
            await sendWorkflowJobAlerts({...job, sender: {login: 'ghost', type: 'User'}} as unknown as WorkflowJobWithRelations);

            expect(mockResolveSlackUserId).not.toHaveBeenCalled();
            expect(mockPostMessage).toHaveBeenCalledTimes(2);
        });

        it('a slow sender lookup sends the alert without a mention', async () => {
            vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
            try {
                setDestinations(slackDestination('rule-1', 's'));
                mockResolveSlackUserId.mockReturnValue(new Promise(() => {}));

                const sending = sendWorkflowJobAlerts(job);
                await vi.advanceTimersByTimeAsync(3000);
                await sending;

                expect(slackInputs()).toEqual([expect.objectContaining({senderSlackUserId: null})]);
                expect(mockPostMessage).toHaveBeenCalledTimes(1);
                expect(mockCreateEventLogEntry).toHaveBeenCalledWith(
                    expect.objectContaining({metadata: expect.objectContaining({mentioned: false})}),
                );
            } finally {
                vi.useRealTimers();
            }
        });

        it('revoked token marks the workspace disconnected and logs once per integration', async () => {
            setDestinations(slackDestination('rule-1', 's1'), destination('rule-1', 'a'), slackDestination('rule-1', 's2'));
            mockPostMessage.mockRejectedValueOnce(new SlackApiError('token_revoked'));
            mockMarkWorkspaceDisconnected.mockResolvedValue(['int-1', 'int-2']);

            await sendWorkflowJobAlerts(job);

            expect(mockMarkWorkspaceDisconnected).toHaveBeenCalledTimes(1);
            expect(mockMarkWorkspaceDisconnected).toHaveBeenCalledWith('T1');
            expect(postedChannels()).toEqual(['C-s1']);
            expect(mockProxyFetch).toHaveBeenCalledTimes(1);
            expect(disconnectEntries().map(([entry]) => entry)).toEqual([
                expect.objectContaining({integrationId: 'int-1', category: 'integration', type: 'warning', title: 'Slack app disconnected'}),
                expect.objectContaining({integrationId: 'int-2', category: 'integration', type: 'warning', title: 'Slack app disconnected'}),
            ]);
            expect(mockCreateEventLogEntry).toHaveBeenCalledWith(expect.objectContaining({category: 'notification', type: 'alert'}));
        });

        it('writes no disconnect entry when another alert already disconnected the workspace', async () => {
            setDestinations(slackDestination('rule-1', 's1'), slackDestination('rule-1', 's2'));
            mockPostMessage.mockRejectedValueOnce(new SlackApiError('invalid_auth'));

            await sendWorkflowJobAlerts(job);

            expect(mockMarkWorkspaceDisconnected).toHaveBeenCalledTimes(1);
            expect(postedChannels()).toEqual(['C-s1']);
            expect(disconnectEntries()).toEqual([]);
        });

        it('disconnected workspace skips Slack without calling Slack', async () => {
            setDestinations(destination('rule-1', 'a'), slackDestination('rule-1', 's'));
            mockLoadWorkspaceForIntegration.mockResolvedValue({teamId: 'T1', botToken: 'xoxb-secret', disconnected: true});

            await sendWorkflowJobAlerts(job);
            mockLoadWorkspaceForIntegration.mockResolvedValue(null);
            await sendWorkflowJobAlerts(job);
            mockLoadWorkspaceForIntegration.mockRejectedValue(new Error('kms down'));
            await sendWorkflowJobAlerts(job);

            expect(mockPostMessage).not.toHaveBeenCalled();
            expect(mockResolveSlackUserId).not.toHaveBeenCalled();
            expect(mockProxyFetch).toHaveBeenCalledTimes(3);
            expect(slackInputs()).toHaveLength(3);
        });

        it('one failing Slack handle does not stop others', async () => {
            setDestinations(slackDestination('rule-1', 's1'), slackDestination('rule-1', 's2'), destination('rule-1', 'a'));
            mockPostMessage.mockRejectedValueOnce(new SlackApiError('channel_not_found'));

            await sendWorkflowJobAlerts(job);

            expect(postedChannels()).toEqual(['C-s1', 'C-s2']);
            expect(mockProxyFetch).toHaveBeenCalledTimes(1);
            expect(mockMarkWorkspaceDisconnected).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({handleId: 's1', reason: 'channel_not_found'}));
            const logged = [logger.debug, logger.info, logger.warn, logger.error].flatMap((level) => level.mock.calls);
            expect(JSON.stringify(logged)).not.toContain('xoxb-secret');
            expect(JSON.stringify(logged)).not.toContain('U123');
        });

        it('records mentioned in the event log', async () => {
            const mentioned = () => mockCreateEventLogEntry.mock.lastCall?.[0].metadata.mentioned;

            setDestinations(slackDestination('rule-1', 's'));
            await sendWorkflowJobAlerts(job);
            expect(mentioned()).toBe(true);

            mockResolveSlackUserId.mockResolvedValue(null);
            await sendWorkflowJobAlerts(job);
            expect(mentioned()).toBe(false);

            mockResolveSlackUserId.mockResolvedValue('U123');
            setDestinations(destination('rule-1', 'a'));
            await sendWorkflowJobAlerts(job);
            expect(mentioned()).toBe(false);

            setDestinations(slackDestination('rule-1', 's'));
            mockLoadWorkspaceForIntegration.mockResolvedValue({teamId: 'T1', botToken: 'xoxb-secret', disconnected: true});
            await sendWorkflowJobAlerts(job);
            expect(mentioned()).toBe(false);
        });
    });
});
