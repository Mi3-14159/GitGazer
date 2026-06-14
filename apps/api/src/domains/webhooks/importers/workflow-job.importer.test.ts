import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockUpsertWorkflowJobs = vi.fn();

vi.mock('./shared', () => ({
    upsertWorkflowJobs: (...args: any[]) => mockUpsertWorkflowJobs(...args),
}));
vi.mock('@gitgazer/db/schema', () => ({workflowJobs: {integrationId: 'integrationId', id: 'id'}}));
vi.mock('@gitgazer/db/queries', () => ({workflowJobRelations: {}}));
vi.mock('drizzle-orm', () => ({
    and: (...args: any[]) => ({__and: args}),
    eq: (col: any, val: any) => ({__eq: [col, val]}),
}));

let importer: typeof import('./workflow-job.importer');

const buildEvent = (jobOverrides: any = {}) => ({
    repository: {id: 200},
    sender: {id: 700},
    workflow_job: {
        id: 12345,
        completed_at: '2026-01-01T00:05:00Z',
        conclusion: 'failure',
        created_at: '2026-01-01T00:00:00Z',
        head_branch: 'main',
        name: 'build',
        runner_group_name: 'default',
        run_attempt: 1,
        run_id: 999,
        started_at: '2026-01-01T00:01:00Z',
        status: 'completed',
        workflow_name: 'CI',
        ...jobOverrides,
    },
});

const buildTx = (reloaded: unknown) => ({query: {workflowJobs: {findFirst: vi.fn().mockResolvedValue(reloaded)}}});

beforeEach(async () => {
    mockUpsertWorkflowJobs.mockReset().mockResolvedValue({stale: false});
    importer = await import('./workflow-job.importer');
});

describe('importWorkflowJob', () => {
    it('maps the event to a row, upserts once, and returns the reloaded job with stale', async () => {
        const reloaded = {id: 12345, status: 'completed', conclusion: 'failure'};

        const result = await importer.importWorkflowJob(buildTx(reloaded) as any, 'int-1', buildEvent() as any);

        expect(mockUpsertWorkflowJobs).toHaveBeenCalledTimes(1);
        const [, rows] = mockUpsertWorkflowJobs.mock.calls[0];
        expect(rows[0]).toMatchObject({
            integrationId: 'int-1',
            id: 12345,
            repositoryId: 200,
            senderId: 700,
            status: 'completed',
            conclusion: 'failure',
            headBranch: 'main',
            name: 'build',
            workflowName: 'CI',
            runId: 999,
            workflowRunId: 999,
        });
        expect(result).toEqual({workflowJob: reloaded, stale: false});
    });

    it('propagates the stale flag from the upsert', async () => {
        mockUpsertWorkflowJobs.mockResolvedValue({stale: true});

        const result = await importer.importWorkflowJob(buildTx({id: 12345}) as any, 'int-1', buildEvent() as any);

        expect(result.stale).toBe(true);
    });

    it('maps null completed_at and conclusion to null', async () => {
        await importer.importWorkflowJob(buildTx({id: 12345}) as any, 'int-1', buildEvent({completed_at: null, conclusion: null}) as any);

        const [, rows] = mockUpsertWorkflowJobs.mock.calls[0];
        expect(rows[0].completedAt).toBeNull();
        expect(rows[0].conclusion).toBeNull();
    });

    it('throws when the job cannot be reloaded after the upsert', async () => {
        await expect(importer.importWorkflowJob(buildTx(undefined) as any, 'int-1', buildEvent() as any)).rejects.toThrow(
            /Failed to load workflow job/,
        );
    });
});
