import {syncOrgMembers} from '@gitgazer/backend-services/org-member-sync';
import {linkIntegrationMembers} from '@gitgazer/backend-services/slack/links';
import {insertEvent} from '@gitgazer/github-import/index';
import {postToConnections} from '@gitgazer/backend-services/webhooks.controller';
import {type OrgMemberSyncTask, type SlackLookupTask} from '@gitgazer/backend-core/clients/sqs.client';
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

type SQSMessage = WebhookMessage | OrgMemberSyncTask | SlackLookupTask;

const isOrgMemberSyncTask = (message: SQSMessage): message is OrgMemberSyncTask => {
    return 'taskType' in message && message.taskType === 'org_member_sync';
};

const isSlackLookupTask = (message: SQSMessage): message is SlackLookupTask => {
    return 'taskType' in message && message.taskType === 'slack_lookup';
};

export const processRecord = async (record: SQSRecord): Promise<WorkflowJobWithRelations | null> => {
    const message: SQSMessage = JSON.parse(record.body);

    if (isOrgMemberSyncTask(message)) {
        await syncOrgMembers(message.installationId, message.accountLogin);
        return null;
    }

    if (isSlackLookupTask(message)) {
        await linkIntegrationMembers(message.teamId, message.integrationId);
        return null;
    }

    // No per-record logger keys: alerts for earlier records log concurrently and would pick them up.
    const {integrationId, eventType, payload, source} = message;

    const {data, stale} = await insertEvent(integrationId, eventType, payload);

    if (source === 'backfill') {
        return null;
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
    } catch (error) {
        logger.warn('Post-commit side effect failed', {
            integrationId,
            eventType,
            error: error instanceof Error ? error.message : String(error),
        });
    }

    return !stale && eventType === 'workflow_job' ? (data as WorkflowJobWithRelations) : null;
};
