import type {SQSRecord} from 'aws-lambda';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockSyncOrgMembers = vi.fn();
const mockInsertEvent = vi.fn();
const mockPostToConnections = vi.fn();
const mockSendWorkflowJobAlerts = vi.fn();

vi.mock('@/domains/github-app/org-member-sync', () => ({
    syncOrgMembers: (...args: any[]) => mockSyncOrgMembers(...args),
}));
vi.mock('@/domains/webhooks/importers/index', () => ({
    insertEvent: (...args: any[]) => mockInsertEvent(...args),
}));
vi.mock('@/domains/webhooks/webhooks.controller', () => ({
    postToConnections: (...args: any[]) => mockPostToConnections(...args),
}));
vi.mock('@/domains/alerting/alerting.controller', () => ({
    sendWorkflowJobAlerts: (...args: any[]) => mockSendWorkflowJobAlerts(...args),
}));

let batchProcessor: typeof import('./batch-processor');

const makeRecord = (body: unknown): SQSRecord => ({body: JSON.stringify(body)}) as SQSRecord;

beforeEach(async () => {
    mockSyncOrgMembers.mockReset().mockResolvedValue(undefined);
    mockInsertEvent.mockReset().mockResolvedValue({data: {}, stale: false});
    mockPostToConnections.mockReset().mockResolvedValue(undefined);
    mockSendWorkflowJobAlerts.mockReset().mockResolvedValue(undefined);
    batchProcessor = await import('./batch-processor');
});

describe('processRecord', () => {
    it('routes an org_member_sync task to syncOrgMembers and skips the importer', async () => {
        await batchProcessor.processRecord(makeRecord({taskType: 'org_member_sync', installationId: 42, accountLogin: 'acme'}));

        expect(mockSyncOrgMembers).toHaveBeenCalledWith(42, 'acme');
        expect(mockInsertEvent).not.toHaveBeenCalled();
        expect(mockPostToConnections).not.toHaveBeenCalled();
        expect(mockSendWorkflowJobAlerts).not.toHaveBeenCalled();
    });

    it('broadcasts and alerts for a fresh (non-stale) workflow_job', async () => {
        mockInsertEvent.mockResolvedValue({data: {id: 7}, stale: false});

        await batchProcessor.processRecord(makeRecord({integrationId: 'int-1', eventType: 'workflow_job', payload: {}}));

        expect(mockInsertEvent).toHaveBeenCalledWith('int-1', 'workflow_job', {});
        expect(mockPostToConnections).toHaveBeenCalledWith('workflows', {eventType: 'workflow_job', integrationId: 'int-1', payload: {id: 7}});
        expect(mockSendWorkflowJobAlerts).toHaveBeenCalledWith({id: 7});
    });

    it('does NOT broadcast or alert for a stale workflow_job', async () => {
        // A stale (no-op) upsert means a duplicate/out-of-order redelivery —
        // neither the WebSocket broadcast nor the Slack alert should fire.
        mockInsertEvent.mockResolvedValue({data: {id: 7}, stale: true});

        await batchProcessor.processRecord(makeRecord({integrationId: 'int-1', eventType: 'workflow_job', payload: {}}));

        expect(mockPostToConnections).not.toHaveBeenCalled();
        expect(mockSendWorkflowJobAlerts).not.toHaveBeenCalled();
    });

    it('skips all post-commit side effects when source is "backfill"', async () => {
        mockInsertEvent.mockResolvedValue({data: {id: 7}, stale: false});

        await batchProcessor.processRecord(makeRecord({integrationId: 'int-1', eventType: 'workflow_job', payload: {}, source: 'backfill'}));

        expect(mockInsertEvent).toHaveBeenCalled();
        expect(mockPostToConnections).not.toHaveBeenCalled();
        expect(mockSendWorkflowJobAlerts).not.toHaveBeenCalled();
    });

    it('broadcasts a fresh workflow_run but does not send job alerts', async () => {
        mockInsertEvent.mockResolvedValue({data: {id: 9}, stale: false});

        await batchProcessor.processRecord(makeRecord({integrationId: 'int-1', eventType: 'workflow_run', payload: {}}));

        expect(mockPostToConnections).toHaveBeenCalledWith('workflows', {eventType: 'workflow_run', integrationId: 'int-1', payload: {id: 9}});
        expect(mockSendWorkflowJobAlerts).not.toHaveBeenCalled();
    });

    it('swallows post-commit side-effect failures so SQS does not retry', async () => {
        mockInsertEvent.mockResolvedValue({data: {id: 7}, stale: false});
        mockPostToConnections.mockRejectedValue(new Error('ws down'));

        await expect(
            batchProcessor.processRecord(makeRecord({integrationId: 'int-1', eventType: 'workflow_job', payload: {}})),
        ).resolves.toBeUndefined();
    });
});
