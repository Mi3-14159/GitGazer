import {
    ChangeMessageVisibilityCommand,
    SendMessageBatchCommand,
    SendMessageBatchRequestEntry,
    SendMessageCommand,
    SQSClient,
} from '@aws-sdk/client-sqs';
import {randomUUID} from 'crypto';

const client = new SQSClient({
    region: process.env.AWS_REGION,
    endpoint: `https://sqs.${process.env.AWS_REGION}.api.aws/`,
});

const SQS_BATCH_LIMIT = 10;

export interface WebhookMessage {
    integrationId: string;
    eventType: string;
    payload: unknown;
    source?: 'backfill';
}

export interface OrgMemberSyncTask {
    taskType: 'org_member_sync';
    installationId: number;
    accountLogin: string;
}

export const sendWebhookEvent = async (queueUrl: string, message: WebhookMessage): Promise<void> => {
    await client.send(
        new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify(message),
            MessageGroupId: message.integrationId,
            MessageDeduplicationId: randomUUID(),
        }),
    );
};

export const sendOrgMemberSyncTask = async (queueUrl: string, task: OrgMemberSyncTask): Promise<void> => {
    await client.send(
        new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify(task),
            MessageGroupId: `org-sync-${task.installationId}`,
            MessageDeduplicationId: randomUUID(),
        }),
    );
};

export type BatchMessage = {
    /** Pre-serialised message body. */
    body: string;
    /**
     * Tenant identifier for SQS fair queues. On a standard queue this groups
     * messages by tenant for noisy-neighbor mitigation only — it does NOT
     * enforce FIFO ordering. Omit to send without a group.
     */
    groupId?: string;
};

/**
 * Sends pre-serialised messages to a standard (non-FIFO) queue, chunked into
 * batches of 10. Throws if any individual message fails so the caller can
 * surface the error (SQS will redeliver the originating task).
 *
 * When a message sets `groupId`, SQS fair queues use it as the tenant
 * identifier to keep one noisy tenant from starving others' dwell time.
 */
export const sendMessageBatch = async (queueUrl: string, messages: BatchMessage[]): Promise<void> => {
    for (let i = 0; i < messages.length; i += SQS_BATCH_LIMIT) {
        const chunk = messages.slice(i, i + SQS_BATCH_LIMIT);
        const entries: SendMessageBatchRequestEntry[] = chunk.map((message, index) => ({
            Id: String(index),
            MessageBody: message.body,
            ...(message.groupId ? {MessageGroupId: message.groupId} : {}),
        }));

        const result = await client.send(new SendMessageBatchCommand({QueueUrl: queueUrl, Entries: entries}));

        if (result.Failed && result.Failed.length > 0) {
            const reasons = result.Failed.map((failure) => `${failure.Id}: ${failure.Message ?? failure.Code ?? 'unknown'}`).join('; ');
            throw new Error(`Failed to enqueue ${result.Failed.length} SQS message(s): ${reasons}`);
        }
    }
};

/**
 * Extends (or shortens) the visibility timeout of an in-flight message. Used to
 * defer redelivery of a failed task — e.g. holding a rate-limited backfill task
 * invisible until GitHub's limit resets, instead of letting it redeliver on the
 * queue's default timeout and churn through retries within the locked window.
 */
export const changeMessageVisibility = async (queueUrl: string, receiptHandle: string, visibilityTimeoutSeconds: number): Promise<void> => {
    await client.send(
        new ChangeMessageVisibilityCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: receiptHandle,
            VisibilityTimeout: visibilityTimeoutSeconds,
        }),
    );
};
