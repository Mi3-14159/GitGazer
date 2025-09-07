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

export type Job<Subtype> = {
  integrationId: string;
  job_id: number;
  created_at: string;
  expire_at: number;
  workflow_job_event: Subtype;
};
