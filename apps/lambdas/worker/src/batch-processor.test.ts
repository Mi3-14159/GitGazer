import type {SQSRecord} from 'aws-lambda';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockSyncOrgMembers = vi.fn();
const mockInsertEvent = vi.fn();
const mockPostToConnections = vi.fn();

vi.mock('@gitgazer/backend-services/org-member-sync', () => ({
    syncOrgMembers: (...args: any[]) => mockSyncOrgMembers(...args),
}));
vi.mock('@gitgazer/github-import/index', () => ({
    insertEvent: (...args: any[]) => mockInsertEvent(...args),
}));
vi.mock('@gitgazer/backend-services/webhooks.controller', () => ({
    postToConnections: (...args: any[]) => mockPostToConnections(...args),
}));

let batchProcessor: typeof import('./batch-processor');

const makeRecord = (body: unknown): SQSRecord => ({body: JSON.stringify(body)}) as SQSRecord;

beforeEach(async () => {
    mockSyncOrgMembers.mockReset().mockResolvedValue(undefined);
    mockInsertEvent.mockReset().mockResolvedValue({data: {}, stale: false});
    mockPostToConnections.mockReset().mockResolvedValue(undefined);
    batchProcessor = await import('./batch-processor');
});

describe('processRecord', () => {
    it('routes an org_member_sync task to syncOrgMembers and skips the importer', async () => {
        const result = await batchProcessor.processRecord(makeRecord({taskType: 'org_member_sync', installationId: 42, accountLogin: 'acme'}));

        expect(mockSyncOrgMembers).toHaveBeenCalledWith(42, 'acme');
        expect(mockInsertEvent).not.toHaveBeenCalled();
        expect(mockPostToConnections).not.toHaveBeenCalled();
        expect(result).toBeNull();
    });

    it('returns the job for a fresh workflow_job and broadcasts it', async () => {
        mockInsertEvent.mockResolvedValue({data: {id: 7}, stale: false});

        const result = await batchProcessor.processRecord(makeRecord({integrationId: 'int-1', eventType: 'workflow_job', payload: {}}));

        expect(result).toEqual({id: 7});
        expect(mockInsertEvent).toHaveBeenCalledWith('int-1', 'workflow_job', {});
        expect(mockPostToConnections).toHaveBeenCalledWith('workflows', {eventType: 'workflow_job', integrationId: 'int-1', payload: {id: 7}});
    });

    it('returns null and does not broadcast for a stale workflow_job', async () => {
        // A stale (no-op) upsert means a duplicate/out-of-order redelivery —
        // neither the WebSocket broadcast nor the Slack alert should fire.
        mockInsertEvent.mockResolvedValue({data: {id: 7}, stale: true});

        const result = await batchProcessor.processRecord(makeRecord({integrationId: 'int-1', eventType: 'workflow_job', payload: {}}));

        expect(result).toBeNull();
        expect(mockPostToConnections).not.toHaveBeenCalled();
    });

    it('returns null and skips side effects for a backfill event', async () => {
        mockInsertEvent.mockResolvedValue({data: {id: 7}, stale: false});

        const result = await batchProcessor.processRecord(
            makeRecord({integrationId: 'int-1', eventType: 'workflow_job', payload: {}, source: 'backfill'}),
        );

        expect(result).toBeNull();
        expect(mockInsertEvent).toHaveBeenCalled();
        expect(mockPostToConnections).not.toHaveBeenCalled();
    });

    it('returns null for workflow_run but still broadcasts it', async () => {
        mockInsertEvent.mockResolvedValue({data: {id: 9}, stale: false});

        const result = await batchProcessor.processRecord(makeRecord({integrationId: 'int-1', eventType: 'workflow_run', payload: {}}));

        expect(result).toBeNull();
        expect(mockPostToConnections).toHaveBeenCalledWith('workflows', {eventType: 'workflow_run', integrationId: 'int-1', payload: {id: 9}});
    });

    it('swallows post-commit side-effect failures so SQS does not retry, still returning the job', async () => {
        mockInsertEvent.mockResolvedValue({data: {id: 7}, stale: false});
        mockPostToConnections.mockRejectedValue(new Error('ws down'));

        await expect(batchProcessor.processRecord(makeRecord({integrationId: 'int-1', eventType: 'workflow_job', payload: {}}))).resolves.toEqual({
            id: 7,
        });
    });
});
