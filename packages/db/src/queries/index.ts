export * from './metrics';

export const integrationsQueryRelations = {
    githubAppInstallations: {
        with: {
            webhooks: true,
        },
    },
} as const;

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
