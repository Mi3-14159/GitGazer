import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockUpsertWorkflowRuns = vi.fn();
const mockUpsertAssociations = vi.fn();

vi.mock('@/domains/webhooks/importers/shared', () => ({
    upsertWorkflowRuns: (...args: any[]) => mockUpsertWorkflowRuns(...args),
    upsertWorkflowRunPullRequestAssociations: (...args: any[]) => mockUpsertAssociations(...args),
}));

let importer: typeof import('./workflow-run.importer');

const buildEvent = (runOverrides: any = {}) => ({
    repository: {id: 200},
    workflow_run: {
        id: 555,
        actor: {id: 700},
        event: 'push',
        conclusion: 'success',
        created_at: '2026-01-01T00:00:00Z',
        head_branch: 'main',
        name: 'CI',
        run_attempt: 1,
        status: 'completed',
        run_started_at: '2026-01-01T00:01:00Z',
        updated_at: '2026-01-01T00:05:00Z',
        workflow_id: 42,
        head_commit: {author: {name: 'Dev'}, message: 'msg'},
        pull_requests: [],
        ...runOverrides,
    },
});

beforeEach(async () => {
    mockUpsertWorkflowRuns.mockReset().mockResolvedValue({workflowRuns: [{id: 555}], stale: false});
    mockUpsertAssociations.mockReset().mockResolvedValue(undefined);
    importer = await import('./workflow-run.importer');
});

describe('importWorkflowRun', () => {
    it('maps the event to a row, upserts once, and returns the first row with stale', async () => {
        const result = await importer.importWorkflowRun({} as any, 'int-1', buildEvent() as any);

        expect(mockUpsertWorkflowRuns).toHaveBeenCalledTimes(1);
        const [, rows] = mockUpsertWorkflowRuns.mock.calls[0];
        expect(rows[0]).toMatchObject({
            integrationId: 'int-1',
            id: 555,
            repositoryId: 200,
            actorId: 700,
            event: 'push',
            conclusion: 'success',
            headBranch: 'main',
            name: 'CI',
            status: 'completed',
            workflowId: 42,
            headCommitAuthorName: 'Dev',
            headCommitMessage: 'msg',
        });
        expect(result).toEqual({workflowRun: {id: 555}, stale: false});
    });

    it('does NOT write pull-request associations when there are none', async () => {
        await importer.importWorkflowRun({} as any, 'int-1', buildEvent({pull_requests: []}) as any);

        expect(mockUpsertAssociations).not.toHaveBeenCalled();
    });

    it('writes one association per linked pull request', async () => {
        await importer.importWorkflowRun({} as any, 'int-1', buildEvent({pull_requests: [{id: 11}, {id: 22}]}) as any);

        expect(mockUpsertAssociations).toHaveBeenCalledTimes(1);
        const [, associations] = mockUpsertAssociations.mock.calls[0];
        expect(associations).toEqual([
            {integrationId: 'int-1', workflowRunId: 555, pullRequestId: 11},
            {integrationId: 'int-1', workflowRunId: 555, pullRequestId: 22},
        ]);
    });

    it('propagates the stale flag from the upsert', async () => {
        mockUpsertWorkflowRuns.mockResolvedValue({workflowRuns: [{id: 555}], stale: true});

        const result = await importer.importWorkflowRun({} as any, 'int-1', buildEvent() as any);

        expect(result.stale).toBe(true);
    });
});
