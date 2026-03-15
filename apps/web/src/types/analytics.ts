export type WidgetType =
    | 'deployment_frequency'
    | 'lead_time'
    | 'mttr'
    | 'change_failure_rate'
    | 'pr_merge_rate'
    | 'activity_volume'
    | 'ci_duration'
    | 'pr_cycle_time'
    | 'workflow_queue_time'
    | 'contributor_count';

export type WidgetSize = 'small' | 'medium' | 'large' | 'full';

export interface Widget {
    id: string;
    type: WidgetType;
    title: string;
    size: WidgetSize;
}

export interface Dashboard {
    id: string;
    name: string;
    description: string;
    widgets: Widget[];
    isDefault?: boolean;
}

export interface WidgetDefinition {
    type: WidgetType;
    title: string;
    description: string;
    category: 'DORA' | 'SPACE';
    defaultSize: WidgetSize;
}

export const widgetDefinitions: WidgetDefinition[] = [
    {
        type: 'deployment_frequency',
        title: 'Deployment Frequency',
        description: 'Track how often you deploy to production',
        category: 'DORA',
        defaultSize: 'medium',
    },
    {type: 'lead_time', title: 'Lead Time for Changes', description: 'Time from commit to production', category: 'DORA', defaultSize: 'medium'},
    {type: 'mttr', title: 'Mean Time to Recovery', description: 'Average time to recover from failures', category: 'DORA', defaultSize: 'medium'},
    {
        type: 'change_failure_rate',
        title: 'Change Failure Rate',
        description: 'Percentage of deployments that fail',
        category: 'DORA',
        defaultSize: 'medium',
    },
    {type: 'pr_merge_rate', title: 'PR Merge Rate', description: 'Pull request merge success rate', category: 'SPACE', defaultSize: 'medium'},
    {type: 'activity_volume', title: 'Activity Volume', description: 'Commits and activity per period', category: 'SPACE', defaultSize: 'medium'},
    {type: 'ci_duration', title: 'CI Duration', description: 'Average CI pipeline duration', category: 'SPACE', defaultSize: 'medium'},
    {type: 'pr_cycle_time', title: 'PR Cycle Time', description: 'Time from PR open to merge', category: 'SPACE', defaultSize: 'medium'},
    {
        type: 'workflow_queue_time',
        title: 'Workflow Queue Time',
        description: 'Time workflows spend waiting',
        category: 'SPACE',
        defaultSize: 'medium',
    },
    {type: 'contributor_count', title: 'Contributor Count', description: 'Active contributors per period', category: 'SPACE', defaultSize: 'medium'},
];

export const defaultDashboards: Dashboard[] = [
    {
        id: 'dora-metrics',
        name: 'DORA Metrics',
        description: 'DevOps Research and Assessment metrics for elite software delivery performance',
        isDefault: true,
        widgets: [
            {id: 'dora-1', type: 'deployment_frequency', title: 'Deployment Frequency', size: 'medium'},
            {id: 'dora-2', type: 'lead_time', title: 'Lead Time for Changes', size: 'medium'},
            {id: 'dora-3', type: 'mttr', title: 'Mean Time to Recovery', size: 'medium'},
            {id: 'dora-4', type: 'change_failure_rate', title: 'Change Failure Rate', size: 'medium'},
        ],
    },
    {
        id: 'space-metrics',
        name: 'SPACE Metrics',
        description: 'Comprehensive framework for measuring developer productivity and well-being',
        isDefault: true,
        widgets: [
            {id: 'space-1', type: 'pr_merge_rate', title: 'PR Merge Rate', size: 'medium'},
            {id: 'space-2', type: 'activity_volume', title: 'Activity Volume', size: 'medium'},
            {id: 'space-3', type: 'ci_duration', title: 'CI Duration', size: 'medium'},
            {id: 'space-4', type: 'pr_cycle_time', title: 'PR Cycle Time', size: 'medium'},
            {id: 'space-5', type: 'workflow_queue_time', title: 'Workflow Queue Time', size: 'medium'},
            {id: 'space-6', type: 'contributor_count', title: 'Contributor Count', size: 'medium'},
        ],
    },
];
