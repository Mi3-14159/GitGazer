import type {WorkflowJobWithRelations} from '@gitgazer/db/types';
import type {SQL} from 'drizzle-orm';
import {PgDialect} from 'drizzle-orm/pg-core';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const tables = vi.hoisted(() => ({
    githubAppInstallations: {installationId: 'installation_id', integrationId: 'integration_id', accountLogin: 'account_login'},
    workflowRunPullRequests: {integrationId: 'integration_id', workflowRunId: 'workflow_run_id', pullRequestId: 'pull_request_id'},
    pullRequests: {integrationId: 'integration_id', id: 'id', number: 'number', title: 'title'},
}));
vi.mock('@gitgazer/db/schema', () => tables);

const rowsByTable = new Map<object, unknown[] | Error>();
const whereArgs: unknown[] = [];
const fakeTx = {
    select: () => {
        let table: object;
        const builder: Record<string, unknown> = {
            from: (t: object) => {
                table = t;
                return builder;
            },
            innerJoin: () => builder,
            where: (condition: unknown) => {
                whereArgs.push(condition);
                return builder;
            },
            orderBy: () => builder,
            limit: () => builder,
            then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
                const rows = rowsByTable.get(table) ?? [];
                return (rows instanceof Error ? Promise.reject(rows) : Promise.resolve(rows)).then(resolve, reject);
            },
        };
        return builder;
    },
};
const mockWithRlsTransaction = vi.fn();
vi.mock('@gitgazer/db/client', () => ({
    withRlsTransaction: (...args: any[]) => mockWithRlsTransaction(...args),
}));

const mockDownloadJobLog = vi.fn();
vi.mock('@gitgazer/backend-core/clients/github-app.client', () => ({
    downloadJobLog: (...args: any[]) => mockDownloadJobLog(...args),
}));

const mockSummarizeFailure = vi.fn();
vi.mock('./summary', () => ({
    summarizeFailure: (...args: any[]) => mockSummarizeFailure(...args),
}));

vi.mock('@gitgazer/backend-core/config', () => ({
    default: {get: () => ({logFetchTimeoutMs: 5000})},
}));

const mockWithTimeout = vi.fn();
vi.mock('@gitgazer/backend-core/helpers/async', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@gitgazer/backend-core/helpers/async')>()),
    withTimeout: (...args: any[]) => mockWithTimeout(...args),
}));

import {findInstallationId, findPullRequest, loadLogDetails} from './log-details';

const LOG = [
    '2026-10-24T10:00:00.0000000Z ##[group]Run pnpm test',
    '2026-10-24T10:00:01.0000000Z FAIL checkout.spec.ts',
    '2026-10-24T10:00:02.0000000Z ##[error]Process completed with exit code 1.',
].join('\n');

const job = {
    id: 99,
    integrationId: 'int-1',
    workflowRunId: 555,
    workflowName: 'CI',
    name: 'test',
    headBranch: 'main',
    repository: {name: 'app', owner: {login: 'Acme'}},
    workflowRun: {headCommitMessage: 'fix cart'},
} as unknown as WorkflowJobWithRelations;

const verdict = {kind: 'real' as const, evidence: 'passed 5× in a row on main before this'};

describe('log-details', () => {
    beforeEach(() => {
        rowsByTable.clear();
        whereArgs.length = 0;
        mockWithRlsTransaction.mockImplementation(async (p: {callback: (tx: typeof fakeTx) => unknown}) => p.callback(fakeTx));
        mockWithTimeout.mockImplementation((p: Promise<unknown>) => p);
    });

    describe('findInstallationId', () => {
        it('returns the installation linked to the integration', async () => {
            rowsByTable.set(tables.githubAppInstallations, [{installationId: 123}]);

            await expect(findInstallationId('int-1', 'acme')).resolves.toBe(123);
            expect(mockWithRlsTransaction).toHaveBeenCalledWith(expect.objectContaining({integrationIds: ['int-1'], readOnly: true}));
        });

        it('returns null when the integration has no installation', async () => {
            await expect(findInstallationId('int-1', 'acme')).resolves.toBeNull();
        });

        it('returns any installation of the integration without an owner', async () => {
            rowsByTable.set(tables.githubAppInstallations, [{installationId: 123}]);

            await expect(findInstallationId('int-1', null)).resolves.toBe(123);
            const {sql, params} = new PgDialect().sqlToQuery(whereArgs[0] as SQL);
            expect(sql).not.toContain('lower');
            expect(params).toContain('int-1');
        });
    });

    describe('findPullRequest', () => {
        it('returns the first linked pull request', async () => {
            rowsByTable.set(tables.workflowRunPullRequests, [{number: 7, title: 'Fix cart'}]);

            await expect(findPullRequest(job)).resolves.toEqual({number: 7, title: 'Fix cart'});
        });

        it('returns null when no pull request is linked', async () => {
            await expect(findPullRequest(job)).resolves.toBeNull();
        });

        it('returns null when the lookup fails', async () => {
            rowsByTable.set(tables.workflowRunPullRequests, new Error('connection reset'));

            await expect(findPullRequest(job)).resolves.toBeNull();
        });
    });

    describe('loadLogDetails', () => {
        it('returns null without a GitHub App installation and never downloads', async () => {
            await expect(loadLogDetails(job, verdict, null)).resolves.toBeNull();
            expect(mockDownloadJobLog).not.toHaveBeenCalled();
            expect(mockSummarizeFailure).not.toHaveBeenCalled();
        });

        it('returns null when the log download fails', async () => {
            rowsByTable.set(tables.githubAppInstallations, [{installationId: 123}]);
            mockDownloadJobLog.mockRejectedValue(Object.assign(new Error('Resource not accessible by integration'), {status: 403}));

            await expect(loadLogDetails(job, verdict, null)).resolves.toBeNull();
            expect(mockSummarizeFailure).not.toHaveBeenCalled();
        });

        it('downloads the log within the configured timeout and returns excerpt and summary', async () => {
            rowsByTable.set(tables.githubAppInstallations, [{installationId: 123}]);
            mockDownloadJobLog.mockResolvedValue(LOG);
            mockSummarizeFailure.mockResolvedValue('Checkout tests failed.');

            const details = await loadLogDetails(job, verdict, 'Fix cart');

            expect(mockDownloadJobLog).toHaveBeenCalledWith(123, 'Acme', 'app', 99);
            expect(mockWithTimeout).toHaveBeenCalledWith(expect.any(Promise), 5000);
            expect(details).toEqual({summary: 'Checkout tests failed.', excerpt: expect.stringContaining('Process completed with exit code 1.')});
            expect(mockSummarizeFailure).toHaveBeenCalledWith('int-1', {
                repository: 'Acme/app',
                workflowName: 'CI',
                jobName: 'test',
                branch: 'main',
                verdict,
                commitMessage: 'fix cart',
                pullRequestTitle: 'Fix cart',
                logTail: expect.stringContaining('FAIL checkout.spec.ts'),
            });
        });

        it('truncates commit message and pull request title to 500 characters', async () => {
            rowsByTable.set(tables.githubAppInstallations, [{installationId: 123}]);
            mockDownloadJobLog.mockResolvedValue(LOG);
            mockSummarizeFailure.mockResolvedValue(null);
            const longJob = {...job, workflowRun: {headCommitMessage: 'c'.repeat(2000)}} as unknown as WorkflowJobWithRelations;

            await loadLogDetails(longJob, verdict, 't'.repeat(2000));

            const input = mockSummarizeFailure.mock.calls[0][1];
            expect(input.commitMessage).toHaveLength(500);
            expect(input.pullRequestTitle).toHaveLength(500);
        });
    });
});
