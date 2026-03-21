export interface ColumnConfig {
    id: string;
    label: string;
    visible: boolean;
}

export interface FilterValue {
    column: string;
    values: string[];
}

export interface TableView {
    id: string;
    name: string;
    isDefault?: boolean;
    columns: ColumnConfig[];
    filters: FilterValue[];
}

export type WorkflowColumnId =
    | 'workflow'
    | 'repository'
    | 'branch'
    | 'status'
    | 'jobs'
    | 'actor'
    | 'duration'
    | 'created'
    | 'started'
    | 'commit'
    | 'run_number'
    | 'topics';

export const defaultColumns: ColumnConfig[] = [
    {id: 'workflow', label: 'Workflow', visible: true},
    {id: 'repository', label: 'Repository', visible: true},
    {id: 'branch', label: 'Branch', visible: true},
    {id: 'status', label: 'Status', visible: true},
    {id: 'jobs', label: 'Jobs', visible: true},
    {id: 'actor', label: 'Actor', visible: true},
    {id: 'duration', label: 'Duration', visible: true},
    {id: 'created', label: 'Created', visible: true},
    {id: 'started', label: 'Started', visible: false},
    {id: 'commit', label: 'Commit', visible: false},
    {id: 'run_number', label: 'Run #', visible: false},
    {id: 'topics', label: 'Topics', visible: false},
];

export const defaultView: TableView = {
    id: 'default',
    name: 'Default View',
    isDefault: true,
    columns: defaultColumns,
    filters: [],
};

export const filterableColumnIds = ['workflow', 'repository', 'branch', 'status', 'actor', 'topics'];

export const multiValueColumnIds = ['topics'];
