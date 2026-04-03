import {SQSClient, SendMessageCommand} from '@aws-sdk/client-sqs';
import {randomUUID} from 'crypto';

const client = new SQSClient({region: process.env.AWS_REGION});

export interface WebhookMessage {
    integrationId: string;
    eventType: string;
    payload: unknown;
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
