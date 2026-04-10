export * from './metrics';

export const memberQueryRelations = {
    user: true,
} as const;

export const invitationQueryRelations = {
    invitedByUser: true,
    invitee: true,
} as const;

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
