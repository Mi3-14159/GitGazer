import {defineRelations} from 'drizzle-orm';
import * as gitgazerSchema from './gitgazer';
import * as githubSchema from './github';

const schema = {...gitgazerSchema, ...githubSchema};

export const dbRelations = defineRelations(schema, (r) => ({
    integrations: {
        githubAppInstallations: r.many.githubAppInstallations(),
    },
    userAssignments: {
        user: r.one.users({
            from: r.userAssignments.userId,
            to: r.users.id,
            optional: false,
        }),
    },
    enterprises: {
        organizations: r.many.organizations(),
    },
    organizations: {
        enterprise: r.one.enterprises({
            from: [r.organizations.integrationId, r.organizations.enterpriseId],
            to: [r.enterprises.integrationId, r.enterprises.id],
        }),
        repositories: r.many.repositories(),
    },
    repositories: {
        organization: r.one.organizations({
            from: [r.repositories.integrationId, r.repositories.organizationId],
            to: [r.organizations.integrationId, r.organizations.id],
        }),
        workflowRuns: r.many.workflowRuns(),
        workflowJobs: r.many.workflowJobs(),
        owner: r.one.user({
            from: [r.repositories.integrationId, r.repositories.ownerId],
            to: [r.user.integrationId, r.user.id],
        }),
    },
    user: {
        workflowRuns: r.many.workflowRuns(),
        workflowJobs: r.many.workflowJobs(),
    },
    workflowJobs: {
        repository: r.one.repositories({
            from: [r.workflowJobs.integrationId, r.workflowJobs.repositoryId],
            to: [r.repositories.integrationId, r.repositories.id],
            optional: false,
        }),
        sender: r.one.user({
            from: [r.workflowJobs.integrationId, r.workflowJobs.senderId],
            to: [r.user.integrationId, r.user.id],
            optional: false,
        }),
        workflowRun: r.one.workflowRuns({
            from: [r.workflowJobs.integrationId, r.workflowJobs.workflowRunId],
            to: [r.workflowRuns.integrationId, r.workflowRuns.id],
            optional: false,
        }),
    },
    workflowRuns: {
        repository: r.one.repositories({
            from: [r.workflowRuns.integrationId, r.workflowRuns.repositoryId],
            to: [r.repositories.integrationId, r.repositories.id],
            optional: false,
        }),
        actor: r.one.user({
            from: [r.workflowRuns.integrationId, r.workflowRuns.actorId],
            to: [r.user.integrationId, r.user.id],
            optional: false,
        }),
        workflowJobs: r.many.workflowJobs(),
        pullRequests: r.many.workflowRunPullRequests(),
    },
    pullRequests: {
        repository: r.one.repositories({
            from: [r.pullRequests.integrationId, r.pullRequests.repositoryId],
            to: [r.repositories.integrationId, r.repositories.id],
            optional: false,
        }),
        author: r.one.user({
            from: [r.pullRequests.integrationId, r.pullRequests.authorId],
            to: [r.user.integrationId, r.user.id],
        }),
        workflowRuns: r.many.workflowRunPullRequests(),
        reviews: r.many.pullRequestReviews(),
    },
    pullRequestReviews: {
        pullRequest: r.one.pullRequests({
            from: [r.pullRequestReviews.integrationId, r.pullRequestReviews.pullRequestId],
            to: [r.pullRequests.integrationId, r.pullRequests.id],
            optional: false,
        }),
        repository: r.one.repositories({
            from: [r.pullRequestReviews.integrationId, r.pullRequestReviews.repositoryId],
            to: [r.repositories.integrationId, r.repositories.id],
            optional: false,
        }),
        reviewer: r.one.user({
            from: [r.pullRequestReviews.integrationId, r.pullRequestReviews.userId],
            to: [r.user.integrationId, r.user.id],
        }),
    },
    workflowRunPullRequests: {
        workflowRun: r.one.workflowRuns({
            from: [r.workflowRunPullRequests.integrationId, r.workflowRunPullRequests.workflowRunId],
            to: [r.workflowRuns.integrationId, r.workflowRuns.id],
            optional: false,
        }),
        pullRequest: r.one.pullRequests({
            from: [r.workflowRunPullRequests.integrationId, r.workflowRunPullRequests.pullRequestId],
            to: [r.pullRequests.integrationId, r.pullRequests.id],
            optional: false,
        }),
    },
    githubAppInstallations: {
        integration: r.one.integrations({
            from: r.githubAppInstallations.integrationId,
            to: r.integrations.integrationId,
        }),
        webhooks: r.many.githubAppWebhooks(),
    },
    githubAppWebhooks: {
        integration: r.one.integrations({
            from: r.githubAppWebhooks.integrationId,
            to: r.integrations.integrationId,
            optional: false,
        }),
        installation: r.one.githubAppInstallations({
            from: r.githubAppWebhooks.installationId,
            to: r.githubAppInstallations.installationId,
            optional: false,
        }),
    },
    githubOrgMembers: {
        installation: r.one.githubAppInstallations({
            from: r.githubOrgMembers.installationId,
            to: r.githubAppInstallations.installationId,
            optional: false,
        }),
    },
    integrationInvitations: {
        invitedByUser: r.one.users({
            from: r.integrationInvitations.invitedBy,
            to: r.users.id,
            optional: false,
            alias: 'invitedByUser',
        }),
        invitee: r.one.users({
            from: r.integrationInvitations.inviteeId,
            to: r.users.id,
            alias: 'invitee',
        }),
    },
}));

export type DbRelations = typeof dbRelations;
