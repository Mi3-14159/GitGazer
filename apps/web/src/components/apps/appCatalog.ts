import GitHubIcon from '@/components/icons/GitHubIcon.vue';
import type {IntegrationAppType} from '@common/types';
import {GitMerge, MessageSquare, Ticket, Webhook} from '@lucide/vue';
import type {Component} from 'vue';

export type AppInfo = {
    name: string;
    description: string;
    icon: Component;
};

export type AppStat = {before?: string; value: string | number; after?: string};

export const APP_INFO: Record<IntegrationAppType, AppInfo> = {
    github: {name: 'GitHub', description: 'Runs, jobs and pull requests', icon: GitHubIcon},
    webhook: {name: 'Webhook', description: 'Slack incoming webhooks', icon: Webhook},
};

export const COMING_LATER: AppInfo[] = [
    {name: 'Slack', description: 'Ping the person behind a failure', icon: MessageSquare},
    {name: 'GitLab', description: 'Pipelines and merge requests', icon: GitMerge},
    {name: 'Jira', description: 'Tickets for real failures', icon: Ticket},
];

export const GITHUB_APP_INSTALL_URL = 'https://github.com/apps/gitgazer-integration/installations/new';
