import type {WorkflowJobWithRelations} from '@gitgazer/db/types';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const logger = vi.hoisted(() => ({debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => logger}));

const tables = vi.hoisted(() => ({
    notificationRules: {enabled: 'enabled', rule: 'rule', ignore_dependabot: 'ignore_dependabot'},
    githubAppInstallations: {installationId: 'installation_id', integrationId: 'integration_id', accountLogin: 'account_login'},
    workflowRunPullRequests: {integrationId: 'integration_id', workflowRunId: 'workflow_run_id', pullRequestId: 'pull_request_id'},
    pullRequests: {integrationId: 'integration_id', id: 'id', number: 'number', title: 'title'},
}));
vi.mock('@gitgazer/db/schema', () => tables);

const rowsByTable = new Map<object, unknown[]>();
const fakeTx = {
    select: () => {
        let table: object;
        const builder: Record<string, unknown> = {
            from: (t: object) => {
                table = t;
                return builder;
            },
            innerJoin: () => builder,
            where: () => builder,
            orderBy: () => builder,
            limit: () => builder,
            then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
                Promise.resolve(rowsByTable.get(table) ?? []).then(resolve, reject),
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
    sender: {login: 'asmith'},
    workflowRun: {event: 'push', headCommitMessage: 'fix cart'},
} as unknown as WorkflowJobWithRelations;

const rule = (id: string, includeLogDetails: boolean, webhookUrls: string[]) => ({
    id,
    include_log_details: includeLogDetails,
    channels: webhookUrls.map((webhook_url) => ({type: 'SLACK', webhook_url})),
});

const postedBodies = (): string[] => mockProxyFetch.mock.calls.map(([, init]) => init.body as string);
const slackInputs = () => spies.buildSlackAlert.mock.calls.map(([input]) => input);

describe('sendWorkflowJobAlerts', () => {
    beforeEach(() => {
        rowsByTable.clear();
        mockWithRlsTransaction.mockImplementation(async (p: {callback: (tx: typeof fakeTx) => unknown}) => p.callback(fakeTx));
        mockComputeVerdict.mockResolvedValue({kind: 'flaky', evidence: 'failed 4 of last 30 runs; 3 passed on rerun'});
        mockSummarizeFailure.mockResolvedValue(SUMMARY);
        mockDownloadJobLog.mockResolvedValue(LOG);
        mockProxyFetch.mockResolvedValue({ok: true, status: 200});
        mockCreateEventLogEntry.mockResolvedValue(undefined);
        rowsByTable.set(tables.notificationRules, [rule('rule-1', true, ['https://hooks.slack.com/a'])]);
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
        rowsByTable.set(tables.notificationRules, [
            rule('rule-in', true, ['https://hooks.slack.com/in']),
            rule('rule-out', false, ['https://hooks.slack.com/out']),
        ]);

        await sendWorkflowJobAlerts(job);

        expect(spies.loadLogDetails).toHaveBeenCalledTimes(1);
        const byUrl = Object.fromEntries(mockProxyFetch.mock.calls.map(([url, init]) => [url, init.body as string]));
        expect(byUrl['https://hooks.slack.com/in']).toContain(SUMMARY);
        expect(byUrl['https://hooks.slack.com/out']).not.toContain(SUMMARY);
        expect(byUrl['https://hooks.slack.com/out']).not.toContain('Process completed');
    });

    it('does not fetch logs when no matching rule opted in', async () => {
        rowsByTable.set(tables.notificationRules, [rule('rule-out', false, ['https://hooks.slack.com/out'])]);

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
        rowsByTable.set(tables.notificationRules, [rule('rule-1', true, ['https://hooks.slack.com/a', 'https://hooks.slack.com/b'])]);
        mockProxyFetch.mockRejectedValueOnce(new Error('ECONNRESET'));

        await sendWorkflowJobAlerts(job);

        expect(mockProxyFetch.mock.calls.map(([url]) => url)).toEqual(['https://hooks.slack.com/a', 'https://hooks.slack.com/b']);
        expect(mockCreateEventLogEntry).toHaveBeenCalledTimes(1);
    });

    // Alerts run while the worker ingests other records, so shared logger keys cannot identify the job.
    it('passes the job ids with every log line', async () => {
        rowsByTable.set(tables.notificationRules, [rule('rule-1', true, ['https://hooks.slack.com/a', 'https://hooks.slack.com/b'])]);
        mockProxyFetch.mockRejectedValueOnce(new Error('ECONNRESET'));
        mockCreateEventLogEntry.mockRejectedValueOnce(new Error('db down'));

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
});
