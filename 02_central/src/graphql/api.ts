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
  sender: SenderInput,
};

export type WorkflowJobInput = {
  id: number,
  run_id: number,
  run_url: string,
  status: string,
  conclusion?: string | null,
  name: string,
  workflow_name: string,
  head_branch: string,
  run_attempt: number,
  created_at: string,
  started_at: string,
  completed_at?: string | null,
};

export type RepositoryInput = {
  full_name: string,
  name: string,
  html_url: string,
  owner: OwnerInput,
};

export type OwnerInput = {
  login: string,
};

export type SenderInput = {
  login: string,
  type: string,
  id: number,
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
  sender: Sender,
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
  head_branch: string,
};

export type Repository = {
  __typename: "Repository",
  full_name: string,
  name: string,
  html_url: string,
  owner: Owner,
};

export type Owner = {
  __typename: "Owner",
  login: string,
};

export type Sender = {
  __typename: "Sender",
  login: string,
  type: string,
  id: number,
};

export type NotificationRuleInput = {
  integrationId: string,
  owner?: string | null,
  repository_name?: string | null,
  workflow_name?: string | null,
  head_branch?: string | null,
  enabled: boolean,
  channels: Array< NotificationChannelInput | null >,
};

export type NotificationChannelInput = {
  type: NotificationChannelType,
  body?: string | null,
  headers?: string | null,
  method?: string | null,
  query_parameters?: string | null,
  url?: string | null,
  webhook_url?: string | null,
};

export enum NotificationChannelType {
  HTTP = "HTTP",
  SLACK = "SLACK",
}


export type NotificationRule = {
  __typename: "NotificationRule",
  id: string,
  integrationId: string,
  owner?: string | null,
  repository_name?: string | null,
  workflow_name?: string | null,
  head_branch?: string | null,
  enabled: boolean,
  created_at: string,
  updated_at: string,
  channels:  Array<Slack | null >,
};

export type Slack = {
  __typename: "Slack",
  type: NotificationChannelType,
  webhook_url: string,
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
        head_branch: string,
      },
      repository:  {
        __typename: "Repository",
        full_name: string,
        name: string,
        html_url: string,
        owner:  {
          __typename: "Owner",
          login: string,
        },
      },
      sender:  {
        __typename: "Sender",
        login: string,
        type: string,
        id: number,
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
    id: string,
    integrationId: string,
    owner?: string | null,
    repository_name?: string | null,
    workflow_name?: string | null,
    head_branch?: string | null,
    enabled: boolean,
    created_at: string,
    updated_at: string,
    channels:  Array< {
      __typename: "Slack",
      type: NotificationChannelType,
      webhook_url: string,
    } | null >,
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

export type DeleteNotificationRuleMutationVariables = {
  integrationId: string,
  id: string,
};

export type DeleteNotificationRuleMutation = {
  deleteNotificationRule?: boolean | null,
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
          head_branch: string,
        },
        repository:  {
          __typename: "Repository",
          full_name: string,
          name: string,
          html_url: string,
          owner:  {
            __typename: "Owner",
            login: string,
          },
        },
        sender:  {
          __typename: "Sender",
          login: string,
          type: string,
          id: number,
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
      id: string,
      integrationId: string,
      owner?: string | null,
      repository_name?: string | null,
      workflow_name?: string | null,
      head_branch?: string | null,
      enabled: boolean,
      created_at: string,
      updated_at: string,
      channels:  Array< {
        __typename: "Slack",
        type: NotificationChannelType,
        webhook_url: string,
      } | null >,
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
        head_branch: string,
      },
      repository:  {
        __typename: "Repository",
        full_name: string,
        name: string,
        html_url: string,
        owner:  {
          __typename: "Owner",
          login: string,
        },
      },
      sender:  {
        __typename: "Sender",
        login: string,
        type: string,
        id: number,
      },
    },
  } | null,
};
