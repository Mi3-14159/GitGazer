export interface PutNotificationRuleInput {
  integrationId: string;
  enabled: boolean;
  owner: string;
  repository_name?: string;
  workflow_name?: string;
  http?: {
    body: string;
    method: string;
    url: string;
  };
}

export interface NotificationRule extends PutNotificationRuleInput {
  created_at: string;
  updated_at: string;
}

export interface PutNotificationRuleResponse {
  putNotificationRule: NotificationRule;
}

export const putNotificationRule = (
  putNotificationRuleInput: PutNotificationRuleInput,
): string => {
  return `mutation PutNotificationRule {
  putNotificationRule(
      input: {
          integrationId: "${putNotificationRuleInput.integrationId}"
          owner: "${putNotificationRuleInput.owner}"
          enabled: ${putNotificationRuleInput.enabled}
          ${
            putNotificationRuleInput.http
              ? `http: {
              body: "${putNotificationRuleInput.http.body}"
              method: "${putNotificationRuleInput.http.method}"
              url: "${putNotificationRuleInput.http.url}"
          }`
              : ''
          }
          ${putNotificationRuleInput.repository_name ? `repository_name: "${putNotificationRuleInput.repository_name}"` : ''}
          ${putNotificationRuleInput.workflow_name ? `workflow_name: "${putNotificationRuleInput.workflow_name}"` : ''}
      }
  ) {
      integrationId
      workflow_name
      owner
      enabled
      repository_name
      created_at
      updated_at
      http {
          body
          url
          method
      }
  }
}`;
};

export const listNotificationRules = `query ListNotificationRules {
  listNotificationRules {
      nextToken
      items {
          integrationId
          owner
          repository_name
          workflow_name
          enabled
          created_at
          updated_at
      }
  }
}`;

export interface ListNotificationRulesResponse {
  listNotificationRules: {
    items: NotificationRule[];
  };
}
