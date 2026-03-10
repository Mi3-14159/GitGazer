export * from './customQuery';
export * from './metrics';

export const workflowRunRelations = {
    workflowJobs: true,
    repository: {
        with: {
            organization: true,
            owner: true,
        },
    },
} as const;

export const workflowJobRelations = {
    workflowJobs: true,
    repository: {
        with: {
            organization: true,
            owner: true,
        },
    },
} as const;
