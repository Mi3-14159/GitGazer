import {relations} from 'drizzle-orm';
import {bigint, boolean, foreignKey, index, integer, jsonb, primaryKey, text, timestamp, uuid, varchar} from 'drizzle-orm/pg-core';
import {users} from '../gitgazer';
import {githubSchema, tenantSeparationPolicy} from './misc';

export const integrations = githubSchema
    .table(
        'integrations',
        {
            integrationId: uuid('integration_id').primaryKey().defaultRandom(),
            label: varchar('label', {length: 255}).notNull(),
            ownerId: bigint('owner_id', {mode: 'number'})
                .notNull()
                .references(() => users.id),
            secret: uuid('secret').notNull().defaultRandom(),
            createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
        },
        () => [...tenantSeparationPolicy()],
    )
    .enableRLS();

export const userAssignments = githubSchema
    .table(
        'user-assignments',
        {
            integrationId: uuid('integration_id')
                .notNull()
                .references(() => integrations.integrationId, {onDelete: 'cascade'}),
            userId: bigint('user_id', {mode: 'number'})
                .notNull()
                .references(() => users.id),
            createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
        },
        (table) => [primaryKey({columns: [table.userId, table.integrationId]}), ...tenantSeparationPolicy()],
    )
    .enableRLS();

export const events = githubSchema
    .table(
        'events',
        {
            integrationId: uuid('integration_id').references(() => integrations.integrationId, {onDelete: 'cascade'}),
            id: uuid('id').notNull().defaultRandom(),
            createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
            event: jsonb('event').notNull(),
        },
        (table) => [primaryKey({columns: [table.integrationId, table.id]}), ...tenantSeparationPolicy()],
    )
    .enableRLS();

export const enterprises = githubSchema
    .table(
        'enterprises',
        {
            integrationId: uuid('integration_id').references(() => integrations.integrationId, {onDelete: 'cascade'}),
            id: bigint('id', {mode: 'number'}).notNull(),
            name: varchar('name', {length: 255}).notNull(),
        },
        (table) => [primaryKey({columns: [table.integrationId, table.id]}), ...tenantSeparationPolicy()],
    )
    .enableRLS();

export const enterprisesRelations = relations(enterprises, ({many}) => ({
    organizations: many(organizations),
}));

export const organizations = githubSchema
    .table(
        'organizations',
        {
            integrationId: uuid('integration_id').references(() => integrations.integrationId, {onDelete: 'cascade'}),
            id: bigint('id', {mode: 'number'}).notNull(),
            enterpriseId: bigint('enterprise_id', {mode: 'number'}),
            login: varchar('login', {length: 255}).notNull(),
            description: text('description'),
        },
        (table) => [
            primaryKey({columns: [table.integrationId, table.id]}),
            foreignKey({
                columns: [table.integrationId, table.enterpriseId],
                foreignColumns: [enterprises.integrationId, enterprises.id],
            }).onDelete('set null'),
            ...tenantSeparationPolicy(),
        ],
    )
    .enableRLS();

export const organizationsRelations = relations(organizations, ({one, many}) => ({
    enterprise: one(enterprises, {
        fields: [organizations.integrationId, organizations.enterpriseId],
        references: [enterprises.integrationId, enterprises.id],
    }),
    repositories: many(repositories),
}));

export const repositories = githubSchema
    .table(
        'repositories',
        {
            integrationId: uuid('integration_id').references(() => integrations.integrationId, {onDelete: 'cascade'}),
            organizationId: bigint('organization_id', {mode: 'number'}),
            id: bigint('id', {mode: 'number'}).notNull(),
            createdAt: timestamp('created_at', {
                withTimezone: true,
            }).notNull(),
            updatedAt: timestamp('updated_at', {
                withTimezone: true,
            }).notNull(),
            name: varchar('name', {length: 255}).notNull(),
            private: boolean('private').notNull(),
            ownerId: bigint('owner_id', {mode: 'number'}),
        },
        (table) => [
            primaryKey({columns: [table.integrationId, table.id]}),
            foreignKey({
                columns: [table.integrationId, table.organizationId],
                foreignColumns: [organizations.integrationId, organizations.id],
            }).onDelete('set null'),
            ...tenantSeparationPolicy(),
            foreignKey({
                columns: [table.integrationId, table.ownerId],
                foreignColumns: [user.integrationId, user.id],
            }).onDelete('set null'),
        ],
    )
    .enableRLS();

export const repositoriesRelations = relations(repositories, ({one, many}) => ({
    organization: one(organizations, {
        fields: [repositories.integrationId, repositories.organizationId],
        references: [organizations.integrationId, organizations.id],
    }),
    workflowRuns: many(workflowRuns),
    workflowJobs: many(workflowJobs),
    owner: one(user, {
        fields: [repositories.integrationId, repositories.ownerId],
        references: [user.integrationId, user.id],
    }),
}));

export const user = githubSchema
    .table(
        'user',
        {
            integrationId: uuid('integration_id').references(() => integrations.integrationId, {onDelete: 'cascade'}),
            id: bigint('id', {mode: 'number'}).notNull(),
            login: varchar('login', {length: 255}).notNull(),
            type: varchar('type', {length: 255}).notNull(),
        },
        (table) => [primaryKey({columns: [table.integrationId, table.id]}), ...tenantSeparationPolicy()],
    )
    .enableRLS();

export const userRelations = relations(user, ({many}) => ({
    workflowRuns: many(workflowRuns),
}));

export const workflowJobs = githubSchema
    .table(
        'workflow_jobs',
        {
            integrationId: uuid('integration_id')
                .references(() => integrations.integrationId, {onDelete: 'cascade'})
                .notNull(),
            repositoryId: bigint('repository_id', {mode: 'number'}).notNull(),
            id: bigint('id', {mode: 'number'}).notNull(),
            completedAt: timestamp('completed_at', {
                withTimezone: true,
            }),
            conclusion: varchar('conclusion', {length: 50}),
            createdAt: timestamp('created_at', {
                withTimezone: true,
            }).notNull(),
            headBranch: text('head_branch').notNull(),
            name: text('name').notNull(),
            runnerGroupName: text('runner_group_name'),
            runAttempt: integer('run_attempt').notNull(),
            runId: bigint('run_id', {mode: 'number'}).notNull(),
            startedAt: timestamp('started_at', {
                withTimezone: true,
            }).notNull(),
            status: varchar('status', {length: 50}).notNull(),
            workflowName: text('workflow_name').notNull(),
            workflowRunId: bigint('workflow_run_id', {mode: 'number'}).notNull(),
        },
        (table) => [
            primaryKey({columns: [table.integrationId, table.id]}),
            ...tenantSeparationPolicy(),
            foreignKey({
                columns: [table.integrationId, table.repositoryId],
                foreignColumns: [repositories.integrationId, repositories.id],
            }).onDelete('set null'),
            index('workflow_jobs_run_lookup').on(table.integrationId, table.workflowRunId),
        ],
    )
    .enableRLS();

export const workflowJobsRelations = relations(workflowJobs, ({one}) => ({
    repository: one(repositories, {
        fields: [workflowJobs.integrationId, workflowJobs.repositoryId],
        references: [repositories.integrationId, repositories.id],
    }),
    workflowRun: one(workflowRuns, {
        fields: [workflowJobs.integrationId, workflowJobs.workflowRunId],
        references: [workflowRuns.integrationId, workflowRuns.id],
    }),
}));

export const workflowRuns = githubSchema
    .table(
        'workflow_runs',
        {
            integrationId: uuid('integration_id')
                .references(() => integrations.integrationId, {onDelete: 'cascade'})
                .notNull(),
            repositoryId: bigint('repository_id', {mode: 'number'}).notNull(),
            id: bigint('id', {mode: 'number'}).notNull(),
            actorId: bigint('actor_id', {mode: 'number'}).notNull(),
            event: varchar('event', {length: 255}),
            conclusion: varchar({
                enum: ['success', 'failure', 'neutral', 'cancelled', 'timed_out', 'action_required', 'stale', 'skipped'],
            }),
            createdAt: timestamp('created_at', {
                withTimezone: true,
            }).notNull(),
            headBranch: varchar('head_branch', {length: 255}).notNull(),
            name: text('name').notNull(),
            runAttempt: integer('run_attempt').notNull(),
            status: varchar('status', {length: 50}).notNull(),
            runStartedAt: timestamp('run_started_at', {
                mode: 'date',
            }).notNull(),
            updatedAt: timestamp('updated_at', {
                withTimezone: true,
            }).notNull(),
            workflowId: bigint('workflow_id', {mode: 'number'}).notNull(),
            headCommitAuthorName: varchar('head_commit_author_name', {
                length: 255,
            }).notNull(),
            headCommitMessage: text('head_commit_message').notNull().notNull(),
        },
        (table) => [
            primaryKey({columns: [table.integrationId, table.id]}),
            foreignKey({
                columns: [table.integrationId, table.repositoryId],
                foreignColumns: [repositories.integrationId, repositories.id],
            }).onDelete('set null'),
            foreignKey({
                columns: [table.integrationId, table.actorId],
                foreignColumns: [user.integrationId, user.id],
            }).onDelete('set null'),
            ...tenantSeparationPolicy(),
            index('workflow_runs_created_id').on(table.integrationId, table.createdAt, table.id),
        ],
    )
    .enableRLS();

export const workflowRunsRelations = relations(workflowRuns, ({one, many}) => ({
    repository: one(repositories, {
        fields: [workflowRuns.integrationId, workflowRuns.repositoryId],
        references: [repositories.integrationId, repositories.id],
    }),
    actor: one(user, {
        fields: [workflowRuns.integrationId, workflowRuns.actorId],
        references: [user.integrationId, user.id],
    }),
    workflowJobs: many(workflowJobs),
    pullRequests: many(workflowRunPullRequests),
}));

export const pullRequests = githubSchema
    .table(
        'pull_requests',
        {
            integrationId: uuid('integration_id')
                .references(() => integrations.integrationId, {onDelete: 'cascade'})
                .notNull(),
            repositoryId: bigint('repository_id', {mode: 'number'}).notNull(),
            id: bigint('id', {mode: 'number'}).notNull(),
            number: integer('number').notNull(),
            state: varchar('state', {length: 50}).notNull(),
            title: text('title').notNull(),
            body: text('body'),
            headBranch: varchar('head_branch', {length: 255}).notNull(),
            baseBranch: varchar('base_branch', {length: 255}).notNull(),
            authorId: bigint('author_id', {mode: 'number'}).notNull(),
            draft: boolean('draft').notNull(),
            merged: boolean('merged'),
            createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
            updatedAt: timestamp('updated_at', {withTimezone: true}).notNull(),
            closedAt: timestamp('closed_at', {withTimezone: true}),
            mergedAt: timestamp('merged_at', {withTimezone: true}),
        },
        (table) => [
            primaryKey({columns: [table.integrationId, table.id]}),
            foreignKey({
                columns: [table.integrationId, table.repositoryId],
                foreignColumns: [repositories.integrationId, repositories.id],
            }),
            foreignKey({
                columns: [table.integrationId, table.authorId],
                foreignColumns: [user.integrationId, user.id],
            }),
            ...tenantSeparationPolicy(),
        ],
    )
    .enableRLS();

export const pullRequestsRelations = relations(pullRequests, ({one, many}) => ({
    repository: one(repositories, {
        fields: [pullRequests.integrationId, pullRequests.repositoryId],
        references: [repositories.integrationId, repositories.id],
    }),
    author: one(user, {
        fields: [pullRequests.integrationId, pullRequests.authorId],
        references: [user.integrationId, user.id],
    }),
    workflowRuns: many(workflowRunPullRequests),
}));

export const workflowRunPullRequests = githubSchema
    .table(
        'workflow_run_pull_requests',
        {
            integrationId: uuid('integration_id')
                .references(() => integrations.integrationId, {onDelete: 'cascade'})
                .notNull(),
            workflowRunId: bigint('workflow_run_id', {mode: 'number'}).notNull(),
            pullRequestId: bigint('pull_request_id', {mode: 'number'}).notNull(),
        },
        (table) => [
            primaryKey({columns: [table.integrationId, table.workflowRunId, table.pullRequestId]}),
            foreignKey({
                columns: [table.integrationId, table.workflowRunId],
                foreignColumns: [workflowRuns.integrationId, workflowRuns.id],
            }).onDelete('cascade'),
            ...tenantSeparationPolicy(),
            // no foreign key to pull requests, because pull request events are optional
        ],
    )
    .enableRLS();

export const workflowRunPullRequestsRelations = relations(workflowRunPullRequests, ({one}) => ({
    workflowRun: one(workflowRuns, {
        fields: [workflowRunPullRequests.integrationId, workflowRunPullRequests.workflowRunId],
        references: [workflowRuns.integrationId, workflowRuns.id],
    }),
    pullRequest: one(pullRequests, {
        fields: [workflowRunPullRequests.integrationId, workflowRunPullRequests.pullRequestId],
        references: [pullRequests.integrationId, pullRequests.id],
    }),
}));
