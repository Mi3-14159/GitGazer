import {sendWorkflowJobAlerts} from '@/domains/alerting/alerting.controller';
import {syncOrgMembers} from '@/domains/github-app/org-member-sync';
import {insertEvent} from '@/domains/webhooks/importers/index';
import {postToConnections} from '@/domains/webhooks/webhooks.controller';
import {type OrgMemberSyncTask} from '@/shared/clients/sqs.client';
import {getLogger} from '@/shared/logger';
import {EventPayloadMap, WorkflowJobEvent} from '@gitgazer/db/types';
import type {EmitterWebhookEventName} from '@octokit/webhooks';
import type {SQSRecord} from 'aws-lambda';

const logger = getLogger();

type WebhookMessage = {
    integrationId: string;
    eventType: EmitterWebhookEventName & keyof EventPayloadMap;
    payload: EventPayloadMap[EmitterWebhookEventName & keyof EventPayloadMap];
    source?: 'backfill';
};

type SQSMessage = WebhookMessage | OrgMemberSyncTask;

const isOrgMemberSyncTask = (message: SQSMessage): message is OrgMemberSyncTask => {
    return 'taskType' in message && message.taskType === 'org_member_sync';
};

export const processRecord = async (record: SQSRecord): Promise<void> => {
    const message: SQSMessage = JSON.parse(record.body);

    if (isOrgMemberSyncTask(message)) {
        await syncOrgMembers(message.installationId, message.accountLogin);
        return;
    }

    const {integrationId, eventType, payload, source} = message;

    const {data, stale} = await insertEvent(integrationId, eventType, payload);

    if (source === 'backfill') {
        return;
    }

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
