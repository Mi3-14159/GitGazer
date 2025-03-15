/* tslint:disable */
/* eslint-disable */
//  This file was automatically generated and should not be edited.

export type GitGazerWorkflowJobEventInput = {
  integrationId: string,
  job_id: number,
  created_at: string,
  expire_at: number,
  workflow_job_event: WorkflowJobEventInput,
};

export type WorkflowJobEventInput = {
  action: string,
  workflow_job: WorkflowJobInput,
  repository: RepositoryInput,
};

export type WorkflowJobInput = {
  id: number,
  run_id: number,
  run_url: string,
  status: string,
  conclusion?: string | null,
  name: string,
  workflow_name: string,
  run_attempt: number,
  created_at: string,
  started_at: string,
  completed_at?: string | null,
};

export type RepositoryInput = {
  full_name: string,
  html_url: string,
};

export type GitGazerWorkflowJobEvent = {
  __typename: "GitGazerWorkflowJobEvent",
  integrationId: string,
  job_id: number,
  created_at: string,
  expire_at: number,
  workflow_job_event: WorkflowJobEvent,
};

export type WorkflowJobEvent = {
  __typename: "WorkflowJobEvent",
  action: string,
  workflow_job: WorkflowJob,
  repository: Repository,
};

export type WorkflowJob = {
  __typename: "WorkflowJob",
  id: number,
  run_id: number,
  workflow_name: string,
  run_url: string,
  run_attempt: number,
  status: string,
  conclusion?: string | null,
  created_at: string,
  started_at: string,
  completed_at?: string | null,
  name: string,
};

export type Repository = {
  __typename: "Repository",
  full_name: string,
  html_url: string,
};

export type NotificationRuleInput = {
  integrationId: string,
  owner: string,
  repository_name?: string | null,
  workflow_name?: string | null,
  enabled: boolean,
  http?: HttpInput | null,
};

export type HttpInput = {
  body: string,
  headers?: string | null,
  method: string,
  query_parameters?: string | null,
  url: string,
};

export type NotificationRule = {
  __typename: "NotificationRule",
  integrationId: string,
  owner: string,
  repository_name?: string | null,
  workflow_name?: string | null,
  enabled: boolean,
  created_at: string,
  updated_at: string,
  http?: Http | null,
};

export type Http = {
  __typename: "Http",
  body: string,
  headers?: string | null,
  method: string,
  query_parameters?: string | null,
  url: string,
};

export type IntegrationInput = {
  id?: string | null,
  secret?: string | null,
  label: string,
  users?: Array< string | null > | null,
};

export type Integration = {
  __typename: "Integration",
  id: string,
  label: string,
  secret: string,
  owner: string,
  users: Array< string | null >,
};

export type GitGazerWorkflowJobEventFilterInput = {
  integrationId: string,
  job_id?: number | null,
  expire_at?: number | null,
  created_at?: string | null,
};

export type GitGazerWorkflowJobEventConnection = {
  __typename: "GitGazerWorkflowJobEventConnection",
  items:  Array<GitGazerWorkflowJobEvent >,
  nextToken?: string | null,
};

export type NotificationRuleConnection = {
  __typename: "NotificationRuleConnection",
  items:  Array<NotificationRule | null >,
  nextToken?: string | null,
};

export type PutJobMutationVariables = {
  input: GitGazerWorkflowJobEventInput,
};

export type PutJobMutation = {
  putJob?:  {
    __typename: "GitGazerWorkflowJobEvent",
    integrationId: string,
    job_id: number,
    created_at: string,
    expire_at: number,
    workflow_job_event:  {
      __typename: "WorkflowJobEvent",
      action: string,
      workflow_job:  {
        __typename: "WorkflowJob",
        id: number,
        run_id: number,
        workflow_name: string,
        run_url: string,
        run_attempt: number,
        status: string,
        conclusion?: string | null,
        created_at: string,
        started_at: string,
        completed_at?: string | null,
        name: string,
      },
      repository:  {
        __typename: "Repository",
        full_name: string,
        html_url: string,
      },
    },
  } | null,
};

export type PutNotificationRuleMutationVariables = {
  input: NotificationRuleInput,
};

export type PutNotificationRuleMutation = {
  putNotificationRule?:  {
    __typename: "NotificationRule",
    integrationId: string,
    owner: string,
    repository_name?: string | null,
    workflow_name?: string | null,
    enabled: boolean,
    created_at: string,
    updated_at: string,
    http?:  {
      __typename: "Http",
      body: string,
      headers?: string | null,
      method: string,
      query_parameters?: string | null,
      url: string,
    } | null,
  } | null,
};

export type PutIntegrationMutationVariables = {
  input?: IntegrationInput | null,
};

export type PutIntegrationMutation = {
  putIntegration?:  {
    __typename: "Integration",
    id: string,
    label: string,
    secret: string,
    owner: string,
    users: Array< string | null >,
  } | null,
};

export type DeleteIntegrationMutationVariables = {
  id: string,
};

export type DeleteIntegrationMutation = {
  deleteIntegration?: boolean | null,
};

export type ListJobsQueryVariables = {
  filter: GitGazerWorkflowJobEventFilterInput,
  limit?: number | null,
  nextToken?: string | null,
};

export type ListJobsQuery = {
  listJobs?:  {
    __typename: "GitGazerWorkflowJobEventConnection",
    items:  Array< {
      __typename: "GitGazerWorkflowJobEvent",
      integrationId: string,
      job_id: number,
      created_at: string,
      expire_at: number,
      workflow_job_event:  {
        __typename: "WorkflowJobEvent",
        action: string,
        workflow_job:  {
          __typename: "WorkflowJob",
          id: number,
          run_id: number,
          workflow_name: string,
          run_url: string,
          run_attempt: number,
          status: string,
          conclusion?: string | null,
          created_at: string,
          started_at: string,
          completed_at?: string | null,
          name: string,
        },
        repository:  {
          __typename: "Repository",
          full_name: string,
          html_url: string,
        },
      },
    } >,
    nextToken?: string | null,
  } | null,
};

export type ListNotificationRulesQueryVariables = {
  nextToken?: string | null,
};

export type ListNotificationRulesQuery = {
  listNotificationRules?:  {
    __typename: "NotificationRuleConnection",
    items:  Array< {
      __typename: "NotificationRule",
      integrationId: string,
      owner: string,
      repository_name?: string | null,
      workflow_name?: string | null,
      enabled: boolean,
      created_at: string,
      updated_at: string,
      http?:  {
        __typename: "Http",
        body: string,
        headers?: string | null,
        method: string,
        query_parameters?: string | null,
        url: string,
      } | null,
    } | null >,
    nextToken?: string | null,
  } | null,
};

export type ListIntegrationsQueryVariables = {
};

export type ListIntegrationsQuery = {
  listIntegrations:  Array< {
    __typename: "Integration",
    id: string,
    label: string,
    secret: string,
    owner: string,
    users: Array< string | null >,
  } | null >,
};

export type OnPutJobSubscriptionVariables = {
};

export type OnPutJobSubscription = {
  onPutJob?:  {
    __typename: "GitGazerWorkflowJobEvent",
    integrationId: string,
    job_id: number,
    created_at: string,
    expire_at: number,
    workflow_job_event:  {
      __typename: "WorkflowJobEvent",
      action: string,
      workflow_job:  {
        __typename: "WorkflowJob",
        id: number,
        run_id: number,
        workflow_name: string,
        run_url: string,
        run_attempt: number,
        status: string,
        conclusion?: string | null,
        created_at: string,
        started_at: string,
        completed_at?: string | null,
        name: string,
      },
      repository:  {
        __typename: "Repository",
        full_name: string,
        html_url: string,
      },
    },
  } | null,
};
