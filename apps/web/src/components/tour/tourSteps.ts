import {Activity, BellRing, Compass, LayoutDashboard, PartyPopper, PlayCircle, Sparkles, Webhook} from 'lucide-vue-next';
import type {Component} from 'vue';

export interface TourStep {
    id: string;
    type: 'spotlight' | 'modal';
    title: string;
    description: string;
    icon: Component;
    tip?: string;
    target?: string;
    popoverSide?: 'top' | 'right' | 'bottom' | 'left';
    route?: string;
}

export const tourSteps: TourStep[] = [
    {
        id: 'welcome',
        type: 'modal',
        title: 'Welcome to GitGazer!',
        description: 'Your command center for GitHub workflow monitoring. Let\u2019s take a quick tour to get you up and running.',
        icon: Sparkles,
    },
    {
        id: 'navigation',
        type: 'spotlight',
        title: 'Your Navigation Hub',
        description: 'Six sections give you complete visibility into your CI/CD pipelines. We\u2019ll walk through the most important ones.',
        icon: Compass,
        tip: 'The active tab is highlighted \u2014 you\u2019re currently on Overview.',
        target: '[data-tour="nav-bar"]',
        popoverSide: 'bottom',
        route: '/overview',
    },
    {
        id: 'stat-cards',
        type: 'spotlight',
        title: 'Pipeline Health at a Glance',
        description: 'See total workflows, success rate, failures, and in-progress runs. These update in real-time as your CI/CD pipelines run.',
        icon: Activity,
        tip: 'Use the date picker in the top-right to change the time window.',
        target: '[data-tour="stat-cards"]',
        popoverSide: 'bottom',
        route: '/overview',
    },
    {
        id: 'integrations',
        type: 'spotlight',
        title: 'Connect Your Repositories',
        description: 'Set up a GitHub webhook or install the GitHub App to start receiving workflow data. This is the essential first step.',
        icon: Webhook,
        tip: 'The GitHub App is recommended \u2014 it\u2019s easier to set up and supports more features.',
        target: '[data-tour="integrations-content"]',
        popoverSide: 'bottom',
        route: '/integrations',
    },
    {
        id: 'workflows',
        type: 'spotlight',
        title: 'Your Workflow History',
        description:
            'Every GitHub Actions run appears here in real-time. Filter by repository, branch, status, or actor. Expand any row to see individual job details.',
        icon: PlayCircle,
        tip: 'Save custom filter combinations as Views for quick access.',
        target: '[data-tour="workflows-content"]',
        popoverSide: 'top',
        route: '/workflows',
    },
    {
        id: 'notifications',
        type: 'spotlight',
        title: 'Never Miss a Failure',
        description: 'Create notification rules to get alerted when workflows fail. Target specific repositories, workflows, or branches.',
        icon: BellRing,
        tip: 'Start with a rule for your most critical production deployment workflow.',
        target: '[data-tour="notifications-content"]',
        popoverSide: 'bottom',
        route: '/notifications',
    },
    {
        id: 'dashboards',
        type: 'spotlight',
        title: 'Engineering Metrics',
        description:
            'Track DORA and SPACE metrics to measure your team\u2019s software delivery performance. Deployment frequency, change failure rate, and more.',
        icon: LayoutDashboard,
        tip: 'These dashboards work best with at least 2 weeks of workflow data.',
        target: '[data-tour="dashboards-content"]',
        popoverSide: 'bottom',
        route: '/dashboards',
    },
    {
        id: 'completion',
        type: 'modal',
        title: 'You\u2019re All Set!',
        description: 'You\u2019ve seen the key features of GitGazer. The recommended next step is to set up your first integration.',
        icon: PartyPopper,
    },
];
