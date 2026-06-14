import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-sqs', () => ({
    SQSClient: class {
        send(...args: any[]) {
            return mockSend(...args);
        }
    },
    SendMessageCommand: class {
        constructor(public input: any) {}
    },
    SendMessageBatchCommand: class {
        constructor(public input: any) {}
    },
    ChangeMessageVisibilityCommand: class {
        constructor(public input: any) {}
    },
}));

let sqs: typeof import('./sqs.client');

beforeEach(async () => {
    mockSend.mockReset().mockResolvedValue({});
    sqs = await import('./sqs.client');
});

describe('sendWebhookEvent', () => {
    it('sends with MessageGroupId = integrationId, a JSON body, and a dedup id', async () => {
        await sqs.sendWebhookEvent('https://queue', {integrationId: 'int-1', eventType: 'workflow_job', payload: {a: 1}});

        expect(mockSend).toHaveBeenCalledTimes(1);
        const {input} = mockSend.mock.calls[0][0];
        expect(input.QueueUrl).toBe('https://queue');
        expect(input.MessageGroupId).toBe('int-1');
        expect(JSON.parse(input.MessageBody)).toEqual({integrationId: 'int-1', eventType: 'workflow_job', payload: {a: 1}});
        expect(typeof input.MessageDeduplicationId).toBe('string');
    });
});

describe('sendOrgMemberSyncTask', () => {
    it('sends with MessageGroupId = org-sync-<installationId>', async () => {
        await sqs.sendOrgMemberSyncTask('https://queue', {taskType: 'org_member_sync', installationId: 99, accountLogin: 'acme'});

        const {input} = mockSend.mock.calls[0][0];
        expect(input.MessageGroupId).toBe('org-sync-99');
        expect(JSON.parse(input.MessageBody)).toEqual({taskType: 'org_member_sync', installationId: 99, accountLogin: 'acme'});
    });
});

describe('sendMessageBatch', () => {
    it('chunks messages into batches of 10 with per-chunk string Ids', async () => {
        const messages = Array.from({length: 23}, (_, i) => ({body: `m${i}`}));

        await sqs.sendMessageBatch('https://queue', messages);

        expect(mockSend).toHaveBeenCalledTimes(3);
        const chunkSizes = mockSend.mock.calls.map((call) => call[0].input.Entries.length);
        expect(chunkSizes).toEqual([10, 10, 3]);
        expect(mockSend.mock.calls[0][0].input.Entries[0].Id).toBe('0');
        expect(mockSend.mock.calls[2][0].input.Entries[2].Id).toBe('2');
    });

    it('sets MessageGroupId only when a message provides groupId', async () => {
        await sqs.sendMessageBatch('https://queue', [{body: 'a', groupId: 'tenant-1'}, {body: 'b'}]);

        const entries = mockSend.mock.calls[0][0].input.Entries;
        expect(entries[0].MessageGroupId).toBe('tenant-1');
        expect(entries[1].MessageGroupId).toBeUndefined();
    });

    it('throws when SQS reports failed entries', async () => {
        mockSend.mockResolvedValue({Failed: [{Id: '0', Code: 'X', Message: 'boom'}]});

        await expect(sqs.sendMessageBatch('https://queue', [{body: 'a'}])).rejects.toThrow(/Failed to enqueue 1 SQS message/);
    });

    it('does not call SQS for an empty message array', async () => {
        await sqs.sendMessageBatch('https://queue', []);
        expect(mockSend).not.toHaveBeenCalled();
    });
});

describe('changeMessageVisibility', () => {
    it('sends a ChangeMessageVisibility command with the timeout', async () => {
        await sqs.changeMessageVisibility('https://queue', 'receipt-123', 300);

        const {input} = mockSend.mock.calls[0][0];
        expect(input.QueueUrl).toBe('https://queue');
        expect(input.ReceiptHandle).toBe('receipt-123');
        expect(input.VisibilityTimeout).toBe(300);
    });
});
