/**
 * Shared webhook event-name validation.
 */

import type {EmitterWebhookEventName} from '@octokit/webhooks';

const IMPORT_EVENT_NAMES: EmitterWebhookEventName[] = ['workflow_job', 'workflow_run', 'pull_request', 'pull_request_review', 'ping'];

const GITHUB_APP_EVENT_NAMES: string[] = ['installation', 'installation_repositories', 'installation_target', 'organization'];

/**
 * Validate that an event name is a supported import webhook event.
 */
export function isValidImportEvent(eventName: string): boolean {
    return IMPORT_EVENT_NAMES.includes(eventName as EmitterWebhookEventName);
}

/**
 * Validate that an event name is a supported GitHub App webhook event.
 */
export function isValidGithubAppEvent(eventName: string): boolean {
    return GITHUB_APP_EVENT_NAMES.includes(eventName);
}
