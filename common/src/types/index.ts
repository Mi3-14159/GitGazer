import type {
  WebhookEvent,
  WorkflowJobEvent,
  WorkflowRunEvent,
} from "@octokit/webhooks-types";

export type * from "@octokit/webhooks-types";

export type NotificationRule = {
  integrationId: string;
  id?: string;
  channels: NotificationRuleChannel[];
  createdAt: string;
  updatedAt: string;
  enabled: boolean;
  ignore_dependabot: boolean;
  rule: NotificationRuleRule;
};

// implement a guard clause for NotificationRule
export const isNotificationRule = (rule: any): rule is NotificationRule => {
  return (
    typeof rule.integrationId === "string" &&
    Array.isArray(rule.channels) &&
    rule.channels.every(isNotificationRuleChannel) &&
    typeof rule.createdAt === "string" &&
    typeof rule.updatedAt === "string" &&
    typeof rule.enabled === "boolean" &&
    typeof rule.ignore_dependabot === "boolean" &&
    isNotificationRuleRule(rule.rule)
  );
};

export enum NotificationRuleChannelType {
  SLACK = "SLACK",
}

export type NotificationRuleChannel = {
  type: NotificationRuleChannelType;
  webhook_url: string;
};

export const isNotificationRuleChannel = (
  channel: any
): channel is NotificationRuleChannel => {
  return (
    Object.values(NotificationRuleChannelType).includes(channel.type) &&
    typeof channel.webhook_url === "string"
  );
};

export type NotificationRuleRule = {
  head_branch: string;
  owner: string;
  repository_name: string;
  workflow_name: string;
};

export const isNotificationRuleRule = (
  rule: any
): rule is NotificationRuleRule => {
  return (
    typeof rule.head_branch === "string" &&
    typeof rule.owner === "string" &&
    typeof rule.repository_name === "string" &&
    typeof rule.workflow_name === "string"
  );
};

export type NotificationRuleUpdate = Omit<
  NotificationRule,
  "createdAt" | "updatedAt"
>;

export const isNotificationRuleUpdate = (
  rule: any
): rule is NotificationRuleUpdate => {
  return (
    typeof rule.integrationId === "string" &&
    Array.isArray(rule.channels) &&
    rule.channels.every(isNotificationRuleChannel) &&
    typeof rule.enabled === "boolean" &&
    typeof rule.ignore_dependabot === "boolean" &&
    isNotificationRuleRule(rule.rule)
  );
};

export type Integration = {
  id: string;
  label: string;
  owner: string;
  secret: string;
};

export const isIntegration = (integration: any): integration is Integration => {
  return (
    typeof integration.id === "string" &&
    typeof integration.label === "string" &&
    typeof integration.owner === "string" &&
    typeof integration.secret === "string"
  );
};

export enum JobType {
  WORKFLOW_JOB = "workflow_job",
  WORKFLOW_RUN = "workflow_run",
}

export const isWorkflowJobEvent = (
  event: WebhookEvent
): event is WorkflowJobEvent => {
  return (
    (event as WorkflowJobEvent).workflow_job !== undefined &&
    (event as WorkflowJobEvent).workflow_job.id !== undefined
  );
};

export const isWorkflowRunEvent = (
  event: WebhookEvent
): event is WorkflowRunEvent => {
  return (
    (event as WorkflowRunEvent).workflow_run !== undefined &&
    (event as WorkflowRunEvent).workflow_run.id !== undefined
  );
};

export type WorkflowEvent<T extends JobType> = T extends JobType.WORKFLOW_JOB
  ? WorkflowJobEvent
  : T extends JobType.WORKFLOW_RUN
  ? WorkflowRunEvent
  : WorkflowJobEvent | WorkflowRunEvent;

export type Job<Subtype> = {
  integrationId: string;
  id: string;
  created_at: string;
  expire_at?: number;
  event_type: JobType;
  workflow_event: Subtype;
};

export enum ProjectionType {
  minimal = "minimal",
}

export type JobsResponse<T> = {
  items: T[];
  lastEvaluatedKey?: {
    [key: string]: any;
  };
}[];

export type JobRequestParameters = {
  limit?: number;
  projection?: ProjectionType;
  exclusiveStartKeys?: { [key: string]: any }[];
};

export const isJobRequestParameters = (
  params: any
): params is JobRequestParameters => {
  if (!params) {
    return true;
  }

  if (params.limit && isNaN(parseInt(params.limit, 10))) {
    return false;
  }

  if (
    params.projection &&
    !Object.values(ProjectionType).includes(params.projection)
  ) {
    return false;
  }

  if (params.exclusiveStartKeys && !Array.isArray(params.exclusiveStartKeys)) {
    return false;
  }

  return true;
};

export type StreamJobEvent<Subtype> = {
  eventType: JobType;
  payload: Job<Subtype>;
};
