/* tslint:disable */
/* eslint-disable */
// this is an auto generated file. This will be overwritten

import * as APITypes from './api';
type GeneratedMutation<InputType, OutputType> = string & {
    __generatedMutationInput: InputType;
    __generatedMutationOutput: OutputType;
};

export const putJob = /* GraphQL */ `mutation PutJob($input: GitGazerWorkflowJobEventInput!) {
  putJob(input: $input) {
    integrationId
    job_id
    created_at
    expire_at
    workflow_job_event {
      action
      workflow_job {
        id
        run_id
        workflow_name
        run_url
        run_attempt
        status
        conclusion
        created_at
        started_at
        completed_at
        name
        head_branch
        __typename
      }
      repository {
        full_name
        name
        html_url
        owner {
          login
          __typename
        }
        __typename
      }
      sender {
        login
        type
        id
        __typename
      }
      __typename
    }
    __typename
  }
}
` as GeneratedMutation<APITypes.PutJobMutationVariables, APITypes.PutJobMutation>;
export const putNotificationRule = /* GraphQL */ `mutation PutNotificationRule($input: NotificationRuleInput!) {
  putNotificationRule(input: $input) {
    id
    integrationId
    enabled
    created_at
    updated_at
    channels {
      type
      webhook_url
      __typename
    }
    ignore_dependabot
    rule {
      owner
      repository_name
      workflow_name
      head_branch
      __typename
    }
    __typename
  }
}
` as GeneratedMutation<APITypes.PutNotificationRuleMutationVariables, APITypes.PutNotificationRuleMutation>;
export const putIntegration = /* GraphQL */ `mutation PutIntegration($input: IntegrationInput) {
  putIntegration(input: $input) {
    id
    label
    secret
    owner
    users
    __typename
  }
}
` as GeneratedMutation<APITypes.PutIntegrationMutationVariables, APITypes.PutIntegrationMutation>;
export const deleteIntegration = /* GraphQL */ `mutation DeleteIntegration($id: String!) {
  deleteIntegration(id: $id)
}
` as GeneratedMutation<APITypes.DeleteIntegrationMutationVariables, APITypes.DeleteIntegrationMutation>;
export const deleteNotificationRule = /* GraphQL */ `mutation DeleteNotificationRule($integrationId: String!, $id: String!) {
  deleteNotificationRule(integrationId: $integrationId, id: $id)
}
` as GeneratedMutation<APITypes.DeleteNotificationRuleMutationVariables, APITypes.DeleteNotificationRuleMutation>;
