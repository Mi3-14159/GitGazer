import {sendWorkflowJobAlerts} from '@gitgazer/backend-services/alerting.controller';
import {syncOrgMembers} from '@gitgazer/backend-services/org-member-sync';
import {insertEvent} from '@gitgazer/github-import/index';
import {postToConnections} from '@gitgazer/backend-services/webhooks.controller';
import {type OrgMemberSyncTask} from '@gitgazer/backend-core/clients/sqs.client';
import {getLogger} from '@gitgazer/backend-core/logger';
import {EventPayloadMap, WorkflowJobWithRelations} from '@gitgazer/db/types';
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
    logger.appendKeys({integrationId, eventType, source});

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

        if (!stale && eventType === 'workflow_job') {
            await sendWorkflowJobAlerts(data as WorkflowJobWithRelations);
        }
    } catch (error) {
        logger.warn('Post-commit side effect failed', {
            integrationId,
            eventType,
            error: error instanceof Error ? error.message : String(error),
        });
    }
};
