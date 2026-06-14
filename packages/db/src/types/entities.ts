import type {ExtractTablesWithRelations} from 'drizzle-orm';
import type {BuildQueryResult} from 'drizzle-orm/relations';

import type {integrationsQueryRelations, memberQueryRelations, workflowJobRelations, workflowRunRelations} from '../queries';
import type * as schema from '../schema';
import type {MemberRole} from './members';

export type Schema = ExtractTablesWithRelations<typeof schema>;

export type WorkflowRun = typeof schema.workflowRuns.$inferSelect;
export type WorkflowRunInsert = typeof schema.workflowRuns.$inferInsert;
export type WorkflowJob = typeof schema.workflowJobs.$inferSelect;
export type WorkflowJobInsert = typeof schema.workflowJobs.$inferInsert;
export type PullRequest = typeof schema.pullRequests.$inferSelect;
export type PullRequestInsert = typeof schema.pullRequests.$inferInsert;
export type PullRequestReview = typeof schema.pullRequestReviews.$inferSelect;
export type PullRequestReviewInsert = typeof schema.pullRequestReviews.$inferInsert;
export type GithubAppInstallation = typeof schema.githubAppInstallations.$inferSelect;
export type GithubAppWebhook = typeof schema.githubAppWebhooks.$inferSelect;
export type RepositorySelect = typeof schema.repositories.$inferSelect;
export type RepositoryInsert = typeof schema.repositories.$inferInsert;
export type UserSelect = typeof schema.user.$inferSelect;
export type UserInsert = typeof schema.user.$inferInsert;
export type OrganizationSelect = typeof schema.organizations.$inferSelect;
export type OrganizationInsert = typeof schema.organizations.$inferInsert;
export type EnterpriseSelect = typeof schema.enterprises.$inferSelect;
export type EnterpriseInsert = typeof schema.enterprises.$inferInsert;
export type WorkflowRunPullRequestSelect = typeof schema.workflowRunPullRequests.$inferSelect;
export type WorkflowRunPullRequestInsert = typeof schema.workflowRunPullRequests.$inferInsert;
export type IntegrationInvitationSelect = typeof schema.integrationInvitations.$inferSelect;
export type IntegrationInvitationInsert = typeof schema.integrationInvitations.$inferInsert;

export type WorkflowRunWithRelations = BuildQueryResult<Schema, Schema['workflowRuns'], {with: typeof workflowRunRelations}>;
export type WorkflowJobWithRelations = BuildQueryResult<Schema, Schema['workflowJobs'], {with: typeof workflowJobRelations}>;
export type Integration = BuildQueryResult<Schema, Schema['integrations'], {with: typeof integrationsQueryRelations}>;
export type IntegrationWithRole = Integration & {role: MemberRole};
export type IntegrationMember = BuildQueryResult<Schema, Schema['userAssignments'], {with: typeof memberQueryRelations}>;
