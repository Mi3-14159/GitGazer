import {describe, expect, it} from 'vitest';
import {transformPullRequest, transformPullRequestReview, transformWorkflowJob, transformWorkflowRun} from './transform';

const repo = {id: 1, name: 'web', full_name: 'acme/web', organization: {id: 5, login: 'acme'}};

describe('transformWorkflowRun', () => {
    it('maps a completed run and embeds the run, repo, and workflow metadata', () => {
        const apiRun = {id: 10, status: 'completed', triggering_actor: {id: 1, login: 'alice'}, actor: {id: 2, login: 'bob'}};
        const meta = {id: 9, name: 'CI', path: '.github/workflows/ci.yml'};

        const event: any = transformWorkflowRun(apiRun, repo, meta);

        expect(event.action).toBe('completed');
        expect(event.workflow_run).toBe(apiRun);
        expect(event.workflow).toBe(meta);
        expect(event.repository).toBe(repo);
        expect(event.sender).toEqual({id: 1, login: 'alice'}); // prefers triggering_actor
        expect(event.organization).toEqual({id: 5, login: 'acme'});
    });

    it('falls back to actor when triggering_actor is absent', () => {
        const apiRun = {id: 10, status: 'in_progress', actor: {id: 2, login: 'bob'}};

        const event: any = transformWorkflowRun(apiRun, repo, {});

        expect(event.action).toBe('in_progress');
        expect(event.sender).toEqual({id: 2, login: 'bob'});
    });

    it('maps queued-like statuses to queued', () => {
        for (const status of ['queued', 'waiting', 'pending']) {
            const event: any = transformWorkflowRun({status}, repo, {});
            expect(event.action).toBe('queued');
        }
    });

    it('defaults unknown statuses to completed', () => {
        const event: any = transformWorkflowRun({status: 'something-else'}, repo, {});
        expect(event.action).toBe('completed');
    });

    it('omits organization when the repo has none', () => {
        const {organization, ...repoNoOrg} = repo;
        const event: any = transformWorkflowRun({status: 'completed'}, repoNoOrg, {});
        expect(event.organization).toBeUndefined();
    });
});

describe('transformWorkflowJob', () => {
    it('embeds the job, repo, and the explicitly provided sender', () => {
        const apiJob = {id: 20, status: 'completed'};
        const sender = {id: 3, login: 'carol'};

        const event: any = transformWorkflowJob(apiJob, repo, sender);

        expect(event.action).toBe('completed');
        expect(event.workflow_job).toBe(apiJob);
        expect(event.repository).toBe(repo);
        expect(event.sender).toBe(sender);
    });
});

describe('transformPullRequest', () => {
    it('marks merged PRs as closed and sets merged=true', () => {
        const apiPR = {number: 7, state: 'closed', merged_at: '2025-06-01T00:00:00Z', user: {id: 4, login: 'dave'}};

        const event: any = transformPullRequest(apiPR, repo);

        expect(event.action).toBe('closed');
        expect(event.number).toBe(7);
        expect(event.pull_request.merged).toBe(true);
        expect(event.sender).toEqual({id: 4, login: 'dave'});
    });

    it('marks open PRs as opened with merged=false and zeroed counters', () => {
        const apiPR = {number: 8, state: 'open', user: {id: 4}};

        const event: any = transformPullRequest(apiPR, repo);

        expect(event.action).toBe('opened');
        expect(event.pull_request.merged).toBe(false);
        expect(event.pull_request.additions).toBe(0);
        expect(event.pull_request.deletions).toBe(0);
        expect(event.pull_request.changed_files).toBe(0);
        expect(event.pull_request.commits).toBe(0);
    });

    it('marks closed-but-unmerged PRs as closed', () => {
        const apiPR = {number: 9, state: 'closed', user: {id: 4}};

        const event: any = transformPullRequest(apiPR, repo);

        expect(event.action).toBe('closed');
        expect(event.pull_request.merged).toBe(false);
    });

    it('preserves provided counters', () => {
        const apiPR = {number: 10, state: 'open', user: {id: 4}, additions: 5, deletions: 3, changed_files: 2, commits: 4};

        const event: any = transformPullRequest(apiPR, repo);

        expect(event.pull_request.additions).toBe(5);
        expect(event.pull_request.deletions).toBe(3);
        expect(event.pull_request.changed_files).toBe(2);
        expect(event.pull_request.commits).toBe(4);
    });
});

describe('transformPullRequestReview', () => {
    it('lowercases the review state and embeds the PR and repo', () => {
        const apiReview = {id: 30, state: 'APPROVED', user: {id: 5, login: 'erin'}};
        const apiPR = {number: 11, merged_at: null};

        const event: any = transformPullRequestReview(apiReview, apiPR, repo);

        expect(event.action).toBe('submitted');
        expect(event.review.state).toBe('approved');
        expect(event.sender).toEqual({id: 5, login: 'erin'});
        expect(event.pull_request.merged).toBe(false);
    });

    it('sets merged=true when the underlying PR was merged', () => {
        const event: any = transformPullRequestReview({state: 'COMMENTED', user: {}}, {merged_at: '2025-01-01'}, repo);

        expect(event.pull_request.merged).toBe(true);
        expect(event.review.state).toBe('commented');
    });
});
