export interface PutNotificationRuleInput {
  enabled: boolean;
  owner: string;
  repository_name?: string;
  workflow_name?: string;
  http: {
    body: string;
    method: string;
    url: string;
  };
}

export interface NotificationRule extends PutNotificationRuleInput {
  integrationId: string;
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
          owner: "${putNotificationRuleInput.owner}"
          enabled: ${putNotificationRuleInput.enabled}
          http: {
              body: "${putNotificationRuleInput.http.body}"
              method: "${putNotificationRuleInput.http.method}"
              url: "${putNotificationRuleInput.http.url}"
          }
          repository_name: ${putNotificationRuleInput.repository_name ?? null}
          workflow_name: ${putNotificationRuleInput.workflow_name ?? null}
      }
  ) {
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
