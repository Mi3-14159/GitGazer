import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockResolvePat = vi.fn();
const mockInsertEvent = vi.fn();

const mockFetchWorkflowRunsPage = vi.fn();
const mockFetchPullRequestsPage = vi.fn();
const mockFetchWorkflowRun = vi.fn();
const mockFetchWorkflowJobs = vi.fn();
const mockFetchPullRequest = vi.fn();
const mockFetchPullRequestReviews = vi.fn();
const mockFetchRepo = vi.fn();
const mockListOwnerRepos = vi.fn();
const mockFilterReposByTopics = vi.fn();

vi.mock('./pat-resolver', () => ({
    resolvePat: (...args: any[]) => mockResolvePat(...args),
}));

vi.mock('@/domains/webhooks/importers/index', () => ({
    insertEvent: (...args: any[]) => mockInsertEvent(...args),
}));

vi.mock('./transform', () => ({
    transformWorkflowRun: vi.fn(() => ({transformed: 'run'})),
    transformWorkflowJob: vi.fn(() => ({transformed: 'job'})),
    transformPullRequest: vi.fn(() => ({transformed: 'pr'})),
    transformPullRequestReview: vi.fn(() => ({transformed: 'review'})),
}));

vi.mock('./github', () => ({
    PER_PAGE_SIZE: 2,
    GITHUB_RUNS_RESULT_CAP: 4,
    fetchWorkflowRunsPage: (...a: any[]) => mockFetchWorkflowRunsPage(...a),
    fetchPullRequestsPage: (...a: any[]) => mockFetchPullRequestsPage(...a),
    fetchWorkflowRun: (...a: any[]) => mockFetchWorkflowRun(...a),
    fetchWorkflowJobs: (...a: any[]) => mockFetchWorkflowJobs(...a),
    fetchPullRequest: (...a: any[]) => mockFetchPullRequest(...a),
    fetchPullRequestReviews: (...a: any[]) => mockFetchPullRequestReviews(...a),
    fetchRepo: (...a: any[]) => mockFetchRepo(...a),
    listOwnerRepos: (...a: any[]) => mockListOwnerRepos(...a),
    filterReposByTopics: (...a: any[]) => mockFilterReposByTopics(...a),
}));

import {routeTask} from './router';
import type {BackfillEventType} from './tasks';

const ALL: BackfillEventType[] = ['workflow_run', 'workflow_job', 'pull_request', 'pull_request_review'];
const base = {integrationId: 'int-1', owner: 'acme', eventTypes: ALL};

describe('routeTask', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockResolvePat.mockResolvedValue('pat');
        mockInsertEvent.mockResolvedValue({data: {}, stale: false});
        mockFetchRepo.mockResolvedValue({id: 1, name: 'web'});
    });

    it('resolves the PAT for the task integration', async () => {
        await routeTask({...base, kind: 'repo', repo: 'web'});
        expect(mockResolvePat).toHaveBeenCalledWith('int-1');
    });

    describe('discover', () => {
        it('fans out a repo task per active repo (org mode)', async () => {
            mockListOwnerRepos.mockResolvedValue([
                {name: 'alpha', archived: false, disabled: false},
                {name: 'beta', archived: true, disabled: false},
                {name: 'gamma', archived: false, disabled: true},
            ]);

            const result = await routeTask({...base, kind: 'discover'});

            expect(result).toEqual([expect.objectContaining({kind: 'repo', repo: 'alpha', integrationId: 'int-1', owner: 'acme'})]);
        });

        it('restricts to a single repo when provided and skips listing', async () => {
            const result = await routeTask({...base, kind: 'discover', repo: 'only'});

            expect(mockListOwnerRepos).not.toHaveBeenCalled();
            expect(result).toEqual([expect.objectContaining({kind: 'repo', repo: 'only'})]);
        });

        it('filters by topics when provided', async () => {
            mockListOwnerRepos.mockResolvedValue([{name: 'alpha'}, {name: 'beta'}]);
            mockFilterReposByTopics.mockReturnValue([{name: 'beta'}]);

            const result = await routeTask({...base, kind: 'discover', topics: ['gitgazer']});

            expect(mockFilterReposByTopics).toHaveBeenCalled();
            expect(result).toEqual([expect.objectContaining({kind: 'repo', repo: 'beta'})]);
        });
    });

    describe('repo', () => {
        it('seeds both runs and prs pagination when all event types are requested', async () => {
            const result = await routeTask({...base, kind: 'repo', repo: 'web', since: '2025-01-01', until: '2025-12-31'});

            expect(result).toEqual([
                expect.objectContaining({kind: 'runs_page', repo: 'web', page: 1, createdFilter: '2025-01-01..2025-12-31'}),
                expect.objectContaining({kind: 'prs_page', repo: 'web', page: 1}),
            ]);
        });

        it('only seeds runs pagination for workflow-only runs', async () => {
            const result = await routeTask({...base, eventTypes: ['workflow_job'], kind: 'repo', repo: 'web'});

            expect(result).toEqual([expect.objectContaining({kind: 'runs_page', createdFilter: undefined})]);
        });

        it('only seeds prs pagination for pull-request-only runs', async () => {
            const result = await routeTask({...base, eventTypes: ['pull_request_review'], kind: 'repo', repo: 'web'});

            expect(result).toEqual([expect.objectContaining({kind: 'prs_page'})]);
        });
    });

    describe('runs_page', () => {
        it('emits a workflow_run task per run and the next page when the page is full', async () => {
            mockFetchWorkflowRunsPage.mockResolvedValue({runs: [{id: 11}, {id: 12}], totalCount: 5});

            const result = await routeTask({...base, kind: 'runs_page', repo: 'web', page: 1});

            expect(result).toEqual([
                expect.objectContaining({kind: 'workflow_run', runId: 11}),
                expect.objectContaining({kind: 'workflow_run', runId: 12}),
                expect.objectContaining({kind: 'runs_page', page: 2}),
            ]);
        });

        it('stops paginating once all runs are covered', async () => {
            mockFetchWorkflowRunsPage.mockResolvedValue({runs: [{id: 11}], totalCount: 1});

            const result = await routeTask({...base, kind: 'runs_page', repo: 'web', page: 1});

            expect(result).toEqual([expect.objectContaining({kind: 'workflow_run', runId: 11})]);
        });

        it('stops paginating at the GitHub result cap even when more runs are reported', async () => {
            // Mocked cap is 4, page size is 2. On page 2 we have reached the cap
            // (2 pages * 2 per page), so no further page is emitted despite totalCount=10.
            mockFetchWorkflowRunsPage.mockResolvedValue({runs: [{id: 13}, {id: 14}], totalCount: 10});

            const result = await routeTask({...base, kind: 'runs_page', repo: 'web', page: 2});

            expect(result).toEqual([
                expect.objectContaining({kind: 'workflow_run', runId: 13}),
                expect.objectContaining({kind: 'workflow_run', runId: 14}),
            ]);
            expect(result).not.toContainEqual(expect.objectContaining({kind: 'runs_page'}));
        });
    });

    describe('prs_page', () => {
        it('emits a pull_request task per PR and the next page when full', async () => {
            mockFetchPullRequestsPage.mockResolvedValue([
                {number: 1, updated_at: '2025-06-01'},
                {number: 2, updated_at: '2025-05-20'},
            ]);

            const result = await routeTask({...base, kind: 'prs_page', repo: 'web', page: 1});

            expect(result).toEqual([
                expect.objectContaining({kind: 'pull_request', pullNumber: 1}),
                expect.objectContaining({kind: 'pull_request', pullNumber: 2}),
                expect.objectContaining({kind: 'prs_page', page: 2}),
            ]);
        });

        it('filters by since and stops at the since boundary', async () => {
            mockFetchPullRequestsPage.mockResolvedValue([
                {number: 1, updated_at: '2025-06-01'},
                {number: 2, updated_at: '2025-05-01'},
            ]);

            const result = await routeTask({...base, kind: 'prs_page', repo: 'web', page: 1, since: '2025-05-15'});

            expect(result).toEqual([expect.objectContaining({kind: 'pull_request', pullNumber: 1})]);
        });

        it('returns nothing for an empty page', async () => {
            mockFetchPullRequestsPage.mockResolvedValue([]);

            const result = await routeTask({...base, kind: 'prs_page', repo: 'web', page: 1});

            expect(result).toEqual([]);
        });
    });

    describe('workflow_run', () => {
        it('ingests the run and its jobs', async () => {
            mockFetchWorkflowRun.mockResolvedValue({
                workflow_id: 9,
                name: 'CI',
                path: '.github/workflows/ci.yml',
                status: 'completed',
                triggering_actor: {id: 1},
            });
            mockFetchWorkflowJobs.mockResolvedValue([{id: 21}, {id: 22}]);

            const result = await routeTask({...base, kind: 'workflow_run', repo: 'web', runId: 11});

            expect(result).toEqual([]);
            expect(mockInsertEvent).toHaveBeenCalledWith('int-1', 'workflow_run', {transformed: 'run'});
            expect(mockInsertEvent).toHaveBeenCalledWith('int-1', 'workflow_job', {transformed: 'job'});
            expect(mockInsertEvent).toHaveBeenCalledTimes(3);
        });

        it('skips jobs when not requested', async () => {
            mockFetchWorkflowRun.mockResolvedValue({workflow_id: 9, name: 'CI', path: 'p', status: 'completed', actor: {id: 1}});

            await routeTask({...base, eventTypes: ['workflow_run'], kind: 'workflow_run', repo: 'web', runId: 11});

            expect(mockFetchWorkflowJobs).not.toHaveBeenCalled();
            expect(mockInsertEvent).toHaveBeenCalledTimes(1);
        });
    });

    describe('pull_request', () => {
        it('ingests the PR and only submitted reviews', async () => {
            mockFetchPullRequest.mockResolvedValue({number: 1});
            mockFetchPullRequestReviews.mockResolvedValue([
                {id: 1, submitted_at: '2025-06-01'},
                {id: 2, submitted_at: null},
            ]);

            const result = await routeTask({...base, kind: 'pull_request', repo: 'web', pullNumber: 1});

            expect(result).toEqual([]);
            expect(mockInsertEvent).toHaveBeenCalledWith('int-1', 'pull_request', {transformed: 'pr'});
            expect(mockInsertEvent).toHaveBeenCalledWith('int-1', 'pull_request_review', {transformed: 'review'});
            expect(mockInsertEvent).toHaveBeenCalledTimes(2);
        });

        it('skips reviews when not requested', async () => {
            mockFetchPullRequest.mockResolvedValue({number: 1});

            await routeTask({...base, eventTypes: ['pull_request'], kind: 'pull_request', repo: 'web', pullNumber: 1});

            expect(mockFetchPullRequestReviews).not.toHaveBeenCalled();
            expect(mockInsertEvent).toHaveBeenCalledTimes(1);
        });
    });
});
