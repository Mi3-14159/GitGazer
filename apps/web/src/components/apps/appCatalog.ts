import GitHubIcon from '@/components/icons/GitHubIcon.vue';
import type {IntegrationAppType} from '@common/types';
import {MessageSquare, Webhook} from '@lucide/vue';
import type {Component} from 'vue';

// Full class literals so Tailwind can detect them.
export type AppTone = {chip: string; border: string};

export type AppInfo = {
    name: string;
    description: string;
    icon: Component;
    tone: AppTone;
};

export type AppStat = {before?: string; value: string | number; after?: string};

export const APP_INFO: Record<IntegrationAppType, AppInfo> = {
    github: {
        name: 'GitHub',
        description: 'Runs, jobs and pull requests',
        icon: GitHubIcon,
        tone: {chip: 'bg-violet-500/10 text-violet-700 dark:text-violet-400', border: 'border-violet-500/50'},
    },
    webhook: {
        name: 'Webhook',
        description: 'Alerts to any webhook URL',
        icon: Webhook,
        tone: {chip: 'bg-sky-500/10 text-sky-700 dark:text-sky-400', border: 'border-sky-500/50'},
    },
    slack: {
        name: 'Slack',
        description: 'Channel alerts and failure mentions',
        icon: MessageSquare,
        tone: {chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-400', border: 'border-amber-500/50'},
    },
};

export const GITHUB_APP_INSTALL_URL = 'https://github.com/apps/gitgazer-integration/installations/new';
