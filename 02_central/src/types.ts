export interface GQLInput extends GithubWebhookEvent {
  run_id: number;
  workflow_name: string;
  expire_at: number;
  integrationId: string;
}

export interface GithubWebhookEvent {
  action: string;
  workflow_job: WorkflowJob;
  deployment?: Deployment;
  repository: Repository;
  organization?: Organization;
  sender: Sender;
}

export interface Deployment {
  url: string;
  id: number;
  node_id: string;
  task: string;
  original_environment: string;
  environment: string;
  description: null;
  created_at: Date;
  updated_at: Date;
  statuses_url: string;
  repository_url: string;
  creator: Sender;
  sha: string;
  ref: string;
  payload: Payload;
  transient_environment: boolean;
  production_environment: boolean;
  performed_via_github_app: PerformedViaGithubApp;
}

export interface Payload {}

export interface PerformedViaGithubApp {
  id: number;
  slug: string;
  node_id: string;
  owner: Sender;
  name: string;
  description: string;
  external_url: string;
  html_url: string;
  created_at: Date;
  updated_at: Date;
  permissions: Permissions;
  events: string[];
}

export interface Permissions {
  actions: string;
  administration: string;
  attestations: string;
  checks: string;
  contents: string;
  deployments: string;
  discussions: string;
  issues: string;
  merge_queues: string;
  metadata: string;
  packages: string;
  pages: string;
  pull_requests: string;
  repository_hooks: string;
  repository_projects: string;
  security_events: string;
  statuses: string;
  vulnerability_alerts: string;
}

export interface License {
  key: string;
  name: string;
  spdx_id: string;
  url: string;
  node_id: string;
}

export interface WorkflowJob {
  id: number;
  run_id: number;
  workflow_name: string;
  head_branch: string;
  run_url: string;
  run_attempt: number;
  node_id: string;
  head_sha: string;
  url: string;
  html_url: string;
  status: string;
  conclusion?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  name: string;
  steps: Step[]; // don't know how to prevent this from being in the object
  check_run_url: string;
  labels: string[]; // don't know how to prevent this from being in the object
  runner_id: number;
  runner_name: string;
  runner_group_id: number;
  runner_group_name: string;
}

export interface Step {
  name: string;
  status: string;
  conclusion: string;
  number: number;
  started_at: Date;
  completed_at: Date;
}

export interface Repository {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  private: boolean;
  owner: Owner;
  html_url: string;
  description: string;
  fork: boolean;
  url: string;
  forks_url: string;
  keys_url: string;
  collaborators_url: string;
  teams_url: string;
  hooks_url: string;
  issue_events_url: string;
  events_url: string;
  assignees_url: string;
  branches_url: string;
  tags_url: string;
  blobs_url: string;
  git_tags_url: string;
  git_refs_url: string;
  trees_url: string;
  statuses_url: string;
  languages_url: string;
  stargazers_url: string;
  contributors_url: string;
  subscribers_url: string;
  subscription_url: string;
  commits_url: string;
  git_commits_url: string;
  comments_url: string;
  issue_comment_url: string;
  contents_url: string;
  compare_url: string;
  merges_url: string;
  archive_url: string;
  downloads_url: string;
  issues_url: string;
  pulls_url: string;
  milestones_url: string;
  notifications_url: string;
  labels_url: string;
  releases_url: string;
  deployments_url: string;
  created_at: Date;
  updated_at: Date;
  pushed_at: Date;
  git_url: string;
  ssh_url: string;
  clone_url: string;
  svn_url: string;
  homepage: string;
  size: number;
  stargazers_count: number;
  watchers_count: number;
  language: string;
  has_issues: boolean;
  has_projects: boolean;
  has_downloads: boolean;
  has_wiki: boolean;
  has_pages: boolean;
  has_discussions: boolean;
  forks_count: number;
  mirror_url: any;
  archived: boolean;
  disabled: boolean;
  open_issues_count: number;
  license: License;
  allow_forking: boolean;
  is_template: boolean;
  web_commit_signoff_required: boolean;
  topics: string[];
  visibility: string;
  forks: number;
  open_issues: number;
  watchers: number;
  default_branch: string;
  custom_properties: CustomProperties; // don't know how to prevent this from being in the object
}

export interface Owner {
  login: string;
  id: number;
  node_id: string;
  avatar_url: string;
  gravatar_id: string;
  url: string;
  html_url: string;
  followers_url: string;
  following_url: string;
  gists_url: string;
  starred_url: string;
  subscriptions_url: string;
  organizations_url: string;
  repos_url: string;
  events_url: string;
  received_events_url: string;
  type: string;
  site_admin: boolean;
}

export interface CustomProperties {}

export interface Organization {
  login: string;
  id: number;
  node_id: string;
  url: string;
  repos_url: string;
  events_url: string;
  hooks_url: string;
  issues_url: string;
  members_url: string;
  public_members_url: string;
  avatar_url: string;
  description: any;
}

export interface Sender {
  login: string;
  id: number;
  node_id: string;
  avatar_url: string;
  gravatar_id: string;
  url: string;
  html_url: string;
  followers_url: string;
  following_url: string;
  gists_url: string;
  starred_url: string;
  subscriptions_url: string;
  organizations_url: string;
  repos_url: string;
  events_url: string;
  received_events_url: string;
  type: string;
  site_admin: boolean;
}

export interface IntegrationSecret {
  secret: string;
  owner: string;
}
