import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DeleteCommand, DynamoDBDocumentClient, PutCommand, QueryCommand, QueryCommandOutput, UpdateCommand} from '@aws-sdk/lib-dynamodb';

import {getLogger} from '@/logger';
import {Job, NotificationRule, NotificationRuleUpdate, ProjectionType} from '@common/types';
import {WorkflowJobEvent} from '@octokit/webhooks-types';

const notificationTableName = process.env.DYNAMO_DB_NOTIFICATIONS_TABLE_ARN;
if (!notificationTableName) {
    throw new Error('DYNAMO_DB_NOTIFICATIONS_TABLE_ARN is not defined');
}

const jobsTableName = process.env.DYNAMO_DB_JOBS_TABLE_ARN;

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const query = async <T>(commands: QueryCommand[]): Promise<T[]> => {
    const logger = getLogger();
    logger.trace({message: 'Executing DynamoDB query commands', commands});

    const result = await Promise.allSettled(commands.map((command) => client.send(command)));

    const fulfilled = result.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<QueryCommandOutput>[];
    const rejected = result.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    if (rejected.length > 0) {
        logger.error(`Failed to get notifications for integration IDs: ${rejected.map((r) => r.reason).join(', ')}`);
    }

    return fulfilled
        .map((r) => {
            return r.value.Items as T[];
        })
        .flat();
};

export const getNotificationRulesBy = async (params: {integrationIds: string[]; limit?: number; id?: string}): Promise<NotificationRule[]> => {
    const logger = getLogger();
    logger.info({message: 'Getting notification rules for integrations', integrations: params.integrationIds});

    const keyConditionExpressionParts = ['integrationId = :integrationId'];
    if (params.id) {
        keyConditionExpressionParts.push('id = :id');
    }

    const commands = params.integrationIds.map((integrationId) => {
        return new QueryCommand({
            TableName: notificationTableName,
            KeyConditionExpression: keyConditionExpressionParts.join(' AND '),
            ExpressionAttributeValues: {
                ':integrationId': integrationId,
                ...(params.id && {':id': params.id}),
            },
            Limit: params.limit ?? 10,
            IndexName: !params.id ? 'integrationId-index' : undefined,
        });
    });

    return query<NotificationRule>(commands);
};

export const getJobsBy = async (params: {
    integrationIds: string[];
    limit?: number;
    projection?: ProjectionType;
}): Promise<Job<Partial<WorkflowJobEvent>>[]> => {
    const logger = getLogger();
    logger.info({message: 'Getting jobs for integrations', integrations: params.integrationIds});

    if (!jobsTableName) {
        throw new Error('DYNAMO_DB_JOBS_TABLE_ARN is not defined');
    }

    const projectionExpressionValues = [
        'job_id',
        'created_at',
        'integrationId',
        'workflow_job_event.repository.full_name',
        'workflow_job_event.workflow_job.workflow_name',
        'workflow_job_event.workflow_job.name',
        'workflow_job_event.workflow_job.head_branch',
        'workflow_job_event.workflow_job.#status',
        'workflow_job_event.workflow_job.conclusion',
    ];

    const commands = params.integrationIds.map((integrationId) => {
        return new QueryCommand({
            TableName: jobsTableName,
            KeyConditionExpression: 'integrationId = :integrationId',
            ExpressionAttributeValues: {
                ':integrationId': integrationId,
            },
            ExpressionAttributeNames:
                params.projection === ProjectionType.minimal
                    ? {
                          '#status': 'status',
                      }
                    : undefined,
            Limit: params.limit ?? 10,
            IndexName: 'newest_integration_index',
            ScanIndexForward: false,
            ProjectionExpression: params.projection === ProjectionType.minimal ? projectionExpressionValues.join(', ') : undefined,
        });
    });

    return query<Job<Partial<WorkflowJobEvent>>>(commands);
};

export const putNotificationRule = async (rule: NotificationRuleUpdate, createOnly?: boolean): Promise<NotificationRule> => {
    const logger = getLogger();
    logger.info({message: 'Updating notification rule', ruleId: rule.id});

    const now = new Date().toUTCString();
    const {owner, repository_name, workflow_name, head_branch} = rule.rule;

    const command = new UpdateCommand({
        TableName: notificationTableName,
        Key: {
            id: rule.id ?? crypto.randomUUID(),
            integrationId: rule.integrationId,
        },
        UpdateExpression:
            'SET #created_at = if_not_exists(#created_at, :created_at), #updated_at = :updated_at, #enabled = :enabled, #channels = :channels, #rule = :rule, #ignore_dependabot = :ignore_dependabot',
        ExpressionAttributeNames: {
            '#created_at': 'created_at',
            '#updated_at': 'updated_at',
            '#enabled': 'enabled',
            '#channels': 'channels',
            '#rule': 'rule',
            '#ignore_dependabot': 'ignore_dependabot',
        },
        ExpressionAttributeValues: {
            ':created_at': now,
            ':updated_at': now,
            ':enabled': rule.enabled,
            ':channels': rule.channels,
            ':rule': {owner, repository_name, workflow_name, head_branch},
            ':ignore_dependabot': rule.ignore_dependabot,
        },
        ...(createOnly && {
            ConditionExpression: 'attribute_not_exists(id)',
        }),
        ReturnValues: 'ALL_NEW',
    });

    const result = await client.send(command);
    return result.Attributes as NotificationRule;
};

export const deleteNotificationRule = async (ruleId: string, integrationId: string): Promise<void> => {
    const logger = getLogger();
    logger.info({message: 'Deleting notification rule', ruleId});

    const command = new DeleteCommand({
        TableName: notificationTableName,
        Key: {
            id: ruleId,
            integrationId,
        },
    });

    await client.send(command);
};

export const putJob = async (job: Job<WorkflowJobEvent>): Promise<Job<WorkflowJobEvent>> => {
    const logger = getLogger();
    logger.info({message: 'Putting job', jobId: job.job_id});

    const command = new PutCommand({
        TableName: jobsTableName,
        Item: job,
    });

    await client.send(command);
    return job;
};
