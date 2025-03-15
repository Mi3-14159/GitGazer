/* tslint:disable */
/* eslint-disable */
// this is an auto generated file. This will be overwritten

import * as APITypes from "./api";
type GeneratedQuery<InputType, OutputType> = string & {
  __generatedQueryInput: InputType;
  __generatedQueryOutput: OutputType;
};

export const listJobs = /* GraphQL */ `query ListJobs(
  $filter: GitGazerWorkflowJobEventFilterInput!
  $limit: Int
  $nextToken: String
) {
  listJobs(filter: $filter, limit: $limit, nextToken: $nextToken) {
    items {
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
          __typename
        }
        repository {
          full_name
          html_url
          __typename
        }
        __typename
      }
      __typename
    }
    nextToken
    __typename
  }
}
` as GeneratedQuery<APITypes.ListJobsQueryVariables, APITypes.ListJobsQuery>;
export const listNotificationRules = /* GraphQL */ `query ListNotificationRules($nextToken: String) {
  listNotificationRules(nextToken: $nextToken) {
    items {
      integrationId
      owner
      repository_name
      workflow_name
      enabled
      created_at
      updated_at
      http {
        body
        headers
        method
        query_parameters
        url
        __typename
      }
      __typename
    }
    nextToken
    __typename
  }
}
` as GeneratedQuery<
  APITypes.ListNotificationRulesQueryVariables,
  APITypes.ListNotificationRulesQuery
>;
export const listIntegrations = /* GraphQL */ `query ListIntegrations {
  listIntegrations {
    id
    label
    secret
    owner
    users
    __typename
  }
}
` as GeneratedQuery<
  APITypes.ListIntegrationsQueryVariables,
  APITypes.ListIntegrationsQuery
>;
