import {SQSClient, SendMessageCommand} from '@aws-sdk/client-sqs';
import {randomUUID} from 'crypto';

const client = new SQSClient({
    region: process.env.AWS_REGION,
    endpoint: `https://sqs.${process.env.AWS_REGION}.api.aws/`,
});

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
