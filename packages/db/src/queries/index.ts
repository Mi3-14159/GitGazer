export * from './mcpQuota';
export * from './metrics';
export * from './readonlyQuery';
export * from './signedContext';

// Explicit columns, so a new users column never reaches the members list by accident
export const memberQueryRelations = {
    user: {columns: {id: true, email: true, name: true, picture: true, githubLogin: true, lastActiveAt: true}},
} as const;

export const integrationsQueryRelations = {
    githubAppInstallations: {
        with: {
            webhooks: true,
        },
    },
    apps: {columns: {type: true}},
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
    workflowRun: true,
    sender: true,
    repository: {
        with: {
            organization: true,
            owner: true,
        },
    },
} as const;
