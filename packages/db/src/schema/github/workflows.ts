import {bigint, boolean, foreignKey, index, integer, jsonb, primaryKey, text, timestamp, uuid, varchar} from 'drizzle-orm/pg-core';
import {GITHUB_APP_WEBHOOK_EVENTS, GITHUB_ORG_ROLES, MEMBER_ASSIGNMENT_SOURCES, MEMBER_ROLES, ORG_SYNC_DEFAULT_ROLES} from '../../types';
import {users} from '../gitgazer';
import {githubSchema, mcpTenantSeparationPolicy, readerTenantSeparationPolicy, writerTenantSeparationPolicy} from './misc';

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
            orgSyncDefaultRole: varchar('org_sync_default_role', {length: 20, enum: ORG_SYNC_DEFAULT_ROLES}).notNull().default('viewer'),
            createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
        },
        () => [writerTenantSeparationPolicy(), readerTenantSeparationPolicy(), mcpTenantSeparationPolicy()],
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
            role: varchar('role', {length: 20, enum: MEMBER_ROLES}).notNull().default('viewer'),
            source: varchar('source', {length: 20, enum: MEMBER_ASSIGNMENT_SOURCES}).notNull().default('manual'),
            createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
        },
        (table) => [primaryKey({columns: [table.userId, table.integrationId]}), writerTenantSeparationPolicy(), readerTenantSeparationPolicy()],
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
        (table) => [primaryKey({columns: [table.integrationId, table.id]}), writerTenantSeparationPolicy(), readerTenantSeparationPolicy()],
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
        (table) => [
            primaryKey({columns: [table.integrationId, table.id]}),
            writerTenantSeparationPolicy(),
            readerTenantSeparationPolicy(),
            mcpTenantSeparationPolicy(),
        ],
    )
    .enableRLS();

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
            writerTenantSeparationPolicy(),
            readerTenantSeparationPolicy(),
            mcpTenantSeparationPolicy(),
        ],
    )
    .enableRLS();

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
            defaultBranch: varchar('default_branch', {length: 255}).notNull().default('main'),
            topics: jsonb('topics').$type<string[]>().notNull().default([]),
        },
        (table) => [
            primaryKey({columns: [table.integrationId, table.id]}),
            foreignKey({
                columns: [table.integrationId, table.organizationId],
                foreignColumns: [organizations.integrationId, organizations.id],
            }).onDelete('set null'),
            writerTenantSeparationPolicy(),
            readerTenantSeparationPolicy(),
            mcpTenantSeparationPolicy(),
            foreignKey({
                columns: [table.integrationId, table.ownerId],
                foreignColumns: [user.integrationId, user.id],
            }).onDelete('set null'),
            index('repositories_topics_gin').using('gin', table.topics),
        ],
    )
    .enableRLS();

export const user = githubSchema
    .table(
        'user',
        {
            integrationId: uuid('integration_id').references(() => integrations.integrationId, {onDelete: 'cascade'}),
            id: bigint('id', {mode: 'number'}).notNull(),
            login: varchar('login', {length: 255}).notNull(),
            type: varchar('type', {length: 255}).notNull(),
        },
        (table) => [
            primaryKey({columns: [table.integrationId, table.id]}),
            writerTenantSeparationPolicy(),
            readerTenantSeparationPolicy(),
            mcpTenantSeparationPolicy(),
        ],
    )
    .enableRLS();

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
            headBranch: text('head_branch'),
            name: text('name').notNull(),
            runnerGroupName: text('runner_group_name'),
            runAttempt: integer('run_attempt').notNull(),
            runId: bigint('run_id', {mode: 'number'}).notNull(),
            senderId: bigint('sender_id', {mode: 'number'}).notNull(),
            startedAt: timestamp('started_at', {
                withTimezone: true,
            }).notNull(),
            status: varchar('status', {length: 50}).notNull(),
            workflowName: text('workflow_name').notNull(),
            workflowRunId: bigint('workflow_run_id', {mode: 'number'}).notNull(),
        },
        (table) => [
            primaryKey({columns: [table.integrationId, table.id]}),
            writerTenantSeparationPolicy(),
            readerTenantSeparationPolicy(),
            mcpTenantSeparationPolicy(),
            foreignKey({
                columns: [table.integrationId, table.repositoryId],
                foreignColumns: [repositories.integrationId, repositories.id],
            }).onDelete('cascade'),
            foreignKey({
                columns: [table.integrationId, table.senderId],
                foreignColumns: [user.integrationId, user.id],
            }),
            index('workflow_jobs_run_lookup').on(table.integrationId, table.workflowRunId),
            index('workflow_jobs_created_at').on(table.integrationId, table.createdAt),
        ],
    )
    .enableRLS();

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
            // Nullable: GitHub sends head_branch = null for some workflow_run events
            // (e.g. pull_request_target). Octokit types it as `string | null`.
            headBranch: varchar('head_branch', {length: 255}),
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
            }).onDelete('cascade'),
            foreignKey({
                columns: [table.integrationId, table.actorId],
                foreignColumns: [user.integrationId, user.id],
            }).onDelete('set null'),
            writerTenantSeparationPolicy(),
            readerTenantSeparationPolicy(),
            mcpTenantSeparationPolicy(),
            index('workflow_runs_created_id').on(table.integrationId, table.createdAt, table.id),
            index('workflow_runs_recovery_lookup').on(table.integrationId, table.workflowId, table.headBranch, table.conclusion, table.createdAt),
        ],
    )
    .enableRLS();

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
            authorId: bigint('author_id', {mode: 'number'}),
            draft: boolean('draft').notNull(),
            merged: boolean('merged'),
            createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
            updatedAt: timestamp('updated_at', {withTimezone: true}).notNull(),
            closedAt: timestamp('closed_at', {withTimezone: true}),
            mergedAt: timestamp('merged_at', {withTimezone: true}),
            additions: integer('additions').notNull().default(0),
            deletions: integer('deletions').notNull().default(0),
            changedFiles: integer('changed_files').notNull().default(0),
            commits: integer('commits').notNull().default(0),
        },
        (table) => [
            primaryKey({columns: [table.integrationId, table.id]}),
            foreignKey({
                columns: [table.integrationId, table.repositoryId],
                foreignColumns: [repositories.integrationId, repositories.id],
            }).onDelete('cascade'),
            foreignKey({
                columns: [table.integrationId, table.authorId],
                foreignColumns: [user.integrationId, user.id],
            }),
            writerTenantSeparationPolicy(),
            readerTenantSeparationPolicy(),
            mcpTenantSeparationPolicy(),
            index('pull_requests_merged_at').on(table.integrationId, table.mergedAt),
            index('pull_requests_closed_at').on(table.integrationId, table.closedAt),
            index('pull_requests_created_at').on(table.integrationId, table.createdAt),
        ],
    )
    .enableRLS();

export const pullRequestReviews = githubSchema
    .table(
        'pull_request_reviews',
        {
            integrationId: uuid('integration_id')
                .references(() => integrations.integrationId, {onDelete: 'cascade'})
                .notNull(),
            id: bigint('id', {mode: 'number'}).notNull(),
            pullRequestId: bigint('pull_request_id', {mode: 'number'}).notNull(),
            repositoryId: bigint('repository_id', {mode: 'number'}).notNull(),
            // Nullable: GitHub sends `user: null` for reviews whose author account has been deleted.
            userId: bigint('user_id', {mode: 'number'}),
            state: varchar('state', {length: 50}).notNull(),
            submittedAt: timestamp('submitted_at', {withTimezone: true}).notNull(),
            body: text('body'),
        },
        (table) => [
            primaryKey({columns: [table.integrationId, table.id]}),
            foreignKey({
                columns: [table.integrationId, table.pullRequestId],
                foreignColumns: [pullRequests.integrationId, pullRequests.id],
            }).onDelete('cascade'),
            foreignKey({
                columns: [table.integrationId, table.repositoryId],
                foreignColumns: [repositories.integrationId, repositories.id],
            }).onDelete('cascade'),
            foreignKey({
                columns: [table.integrationId, table.userId],
                foreignColumns: [user.integrationId, user.id],
            }),
            index('pull_request_reviews_pr_lookup').on(table.integrationId, table.pullRequestId, table.submittedAt),
            index('pull_request_reviews_repo_submitted').on(table.integrationId, table.repositoryId, table.submittedAt),
            writerTenantSeparationPolicy(),
            readerTenantSeparationPolicy(),
            mcpTenantSeparationPolicy(),
        ],
    )
    .enableRLS();

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
            writerTenantSeparationPolicy(),
            readerTenantSeparationPolicy(),
            mcpTenantSeparationPolicy(),
            // no foreign key to pull requests, because pull request events are optional
        ],
    )
    .enableRLS();

export const githubAppInstallations = githubSchema.table(
    'github_app_installations',
    {
        installationId: bigint('installation_id', {mode: 'number'}).primaryKey().notNull(),
        integrationId: uuid('integration_id').references(() => integrations.integrationId, {onDelete: 'cascade'}),
        accountType: varchar('account_type', {length: 50}).notNull(),
        accountLogin: varchar('account_login', {length: 255}).notNull(),
        accountId: bigint('account_id', {mode: 'number'}).notNull(),
        repositorySelection: varchar('repository_selection', {length: 50}).notNull(),
        senderId: bigint('sender_id', {mode: 'number'}).notNull(),
        webhookEvents: jsonb('webhook_events')
            .$type<string[]>()
            .notNull()
            .default([...GITHUB_APP_WEBHOOK_EVENTS]),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow(),
    },
    (table) => [
        index('github_app_installations_integration_id_idx').on(table.integrationId),
        writerTenantSeparationPolicy(),
        readerTenantSeparationPolicy(),
    ],
);

export const githubAppWebhooks = githubSchema
    .table(
        'github_app_webhooks',
        {
            integrationId: uuid('integration_id')
                .references(() => integrations.integrationId, {onDelete: 'cascade'})
                .notNull(),
            installationId: bigint('installation_id', {mode: 'number'})
                .references(() => githubAppInstallations.installationId, {onDelete: 'cascade'})
                .notNull(),
            webhookId: bigint('webhook_id', {mode: 'number'}).notNull(),
            targetType: varchar('target_type', {length: 50}).notNull(),
            targetId: bigint('target_id', {mode: 'number'}).notNull(),
            targetName: varchar('target_name', {length: 255}).notNull(),
            events: jsonb('events').$type<string[]>().notNull(),
            createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
        },
        (table) => [primaryKey({columns: [table.integrationId, table.webhookId]}), writerTenantSeparationPolicy(), readerTenantSeparationPolicy()],
    )
    .enableRLS();

export const githubOrgMembers = githubSchema.table(
    'github_org_members',
    {
        installationId: bigint('installation_id', {mode: 'number'})
            .notNull()
            .references(() => githubAppInstallations.installationId, {onDelete: 'cascade'}),
        githubUserId: bigint('github_user_id', {mode: 'number'}).notNull(),
        githubLogin: varchar('github_login', {length: 255}).notNull(),
        role: varchar('role', {length: 20, enum: GITHUB_ORG_ROLES}).notNull(),
        syncedAt: timestamp('synced_at', {withTimezone: true}).notNull().defaultNow(),
    },
    (table) => [primaryKey({columns: [table.installationId, table.githubUserId]})],
);

export const pendingOrgSync = githubSchema
    .table(
        'pending_org_sync',
        {
            integrationId: uuid('integration_id')
                .notNull()
                .references(() => integrations.integrationId, {onDelete: 'cascade'}),
            githubUserId: bigint('github_user_id', {mode: 'number'}).notNull(),
            githubLogin: varchar('github_login', {length: 255}).notNull(),
            role: varchar('role', {length: 20, enum: ORG_SYNC_DEFAULT_ROLES}).notNull(),
            createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
        },
        (table) => [primaryKey({columns: [table.integrationId, table.githubUserId]}), writerTenantSeparationPolicy(), readerTenantSeparationPolicy()],
    )
    .enableRLS();
