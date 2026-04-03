import {sendWorkflowJobAlerts} from '@/domains/alerting/alerting.controller';
import {insertEvent} from '@/domains/webhooks/importers/index';
import {postToConnections} from '@/domains/webhooks/webhooks.controller';
import {getLogger} from '@/shared/logger';
import {EventPayloadMap, WorkflowJobEvent} from '@gitgazer/db/types';
import type {EmitterWebhookEventName} from '@octokit/webhooks';
import type {SQSRecord} from 'aws-lambda';

const logger = getLogger();

type WebhookMessage = {
    integrationId: string;
    eventType: EmitterWebhookEventName & keyof EventPayloadMap;
    payload: EventPayloadMap[EmitterWebhookEventName & keyof EventPayloadMap];
};

export const processRecord = async (record: SQSRecord): Promise<void> => {
    const message: WebhookMessage = JSON.parse(record.body);
    const {integrationId, eventType, payload} = message;

    const {data, stale} = await insertEvent(integrationId, eventType, payload);

    // Post-commit side effects — failures here should not cause SQS retry
    try {
        if (!stale && (eventType === 'workflow_job' || eventType === 'workflow_run')) {
            await postToConnections('workflows', {
                eventType,
                integrationId,
                payload: data,
            });
        }

        if (eventType === 'workflow_job') {
            await sendWorkflowJobAlerts(integrationId, payload as unknown as WorkflowJobEvent);
        }
    } catch (error) {
        logger.warn('Post-commit side effect failed', {
            integrationId,
            eventType,
            error: error instanceof Error ? error.message : String(error),
        });
    }
};
