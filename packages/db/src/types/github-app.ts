export const GITHUB_APP_WEBHOOK_EVENTS = ['workflow_run', 'workflow_job', 'pull_request', 'pull_request_review'] as const;
export type GithubAppWebhookEvent = (typeof GITHUB_APP_WEBHOOK_EVENTS)[number];
