import {describe, expect, it} from 'vitest';

import {parseInitialTask, parseTask} from './tasks';

const ctx = {
    integrationId: 'int-1',
    owner: 'acme',
    eventTypes: ['workflow_run', 'workflow_job', 'pull_request', 'pull_request_review'],
};

describe('parseTask', () => {
    it('rejects non-object payloads', () => {
        expect(() => parseTask('nope')).toThrow(/JSON object/);
        expect(() => parseTask(null)).toThrow(/JSON object/);
    });

    it('requires a valid integrationId, owner and eventTypes', () => {
        expect(() => parseTask({kind: 'discover', owner: 'acme', eventTypes: ['workflow_run']})).toThrow(/integrationId/);
        expect(() => parseTask({kind: 'discover', integrationId: 'i', eventTypes: ['workflow_run']})).toThrow(/owner/);
        expect(() => parseTask({kind: 'discover', integrationId: 'i', owner: 'acme', eventTypes: []})).toThrow(/eventTypes/);
        expect(() => parseTask({kind: 'discover', integrationId: 'i', owner: 'acme', eventTypes: ['bogus']})).toThrow(/eventTypes/);
    });

    it('accepts a valid discover task with topics', () => {
        const task = parseTask({...ctx, kind: 'discover', topics: ['gitgazer']});
        expect(task.kind).toBe('discover');
    });

    it('validates page-based tasks require a positive integer page', () => {
        expect(() => parseTask({...ctx, kind: 'runs_page', repo: 'web', page: 0})).toThrow(/page/);
        expect(() => parseTask({...ctx, kind: 'runs_page', repo: 'web', page: 1.5})).toThrow(/page/);
        expect(parseTask({...ctx, kind: 'runs_page', repo: 'web', page: 1}).kind).toBe('runs_page');
    });

    it('validates per-entity tasks require their identifier', () => {
        expect(() => parseTask({...ctx, kind: 'workflow_run', repo: 'web'})).toThrow(/runId/);
        expect(() => parseTask({...ctx, kind: 'pull_request', repo: 'web'})).toThrow(/pullNumber/);
        expect(parseTask({...ctx, kind: 'workflow_run', repo: 'web', runId: 5}).kind).toBe('workflow_run');
        expect(parseTask({...ctx, kind: 'pull_request', repo: 'web', pullNumber: 7}).kind).toBe('pull_request');
    });

    it('requires repo for repo-scoped tasks', () => {
        expect(() => parseTask({...ctx, kind: 'repo'})).toThrow(/repo/);
    });

    it('rejects unknown task kinds', () => {
        expect(() => parseTask({...ctx, kind: 'nonsense'})).toThrow(/Unknown backfill task kind/);
    });
});

describe('parseInitialTask', () => {
    it('defaults kind to discover when omitted', () => {
        const task = parseInitialTask({...ctx});
        expect(task.kind).toBe('discover');
    });

    it('accepts an explicit discover payload', () => {
        const task = parseInitialTask({...ctx, kind: 'discover', repo: 'web'});
        expect(task.repo).toBe('web');
    });

    it('rejects non-discover initial payloads', () => {
        expect(() => parseInitialTask({...ctx, kind: 'repo', repo: 'web'})).toThrow(/must be a "discover" task/);
    });
});
