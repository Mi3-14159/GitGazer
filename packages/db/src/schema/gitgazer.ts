import {sql} from 'drizzle-orm';
import {
    bigint,
    boolean,
    bytea,
    foreignKey,
    index,
    integer,
    jsonb,
    pgSchema,
    primaryKey,
    smallint,
    text,
    timestamp,
    unique,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core';
import {
    EVENT_LOG_CATEGORIES,
    EVENT_LOG_TYPES,
    INTEGRATION_APP_TYPES,
    INVITATION_STATUSES,
    MEMBER_ROLES,
    ORG_SYNC_DEFAULT_ROLES,
    SLACK_LINK_SOURCES,
    WEBSOCKET_CHANNELS,
    type EventLogEntryMetadata,
    type NotificationRuleRule,
} from '../types';
import {mcpTenantSeparationPolicy, readerTenantSeparationPolicy, writerTenantSeparationPolicy} from './github';

export const gitgazerSchema = pgSchema('gitgazer');
// No role but its owner has USAGE here, so a lost ACL on the sign function still leaves it unreachable.
export const gitgazerInternalSchema = pgSchema('gitgazer_internal');

export const users = gitgazerSchema.table('users', {
    id: bigint('id', {mode: 'number'}).primaryKey().notNull().generatedAlwaysAsIdentity(),
    cognitoId: uuid('cognito_id').notNull().unique(),
    email: varchar('email', {length: 255}),
    name: varchar('name', {length: 255}),
    picture: text('picture'),
    githubId: bigint('github_id', {mode: 'number'}).unique(),
    githubLogin: varchar('github_login', {length: 255}),
    lastActiveAt: timestamp('last_active_at', {withTimezone: true}),
});

export const integrations = gitgazerSchema
    .table(
        'integrations',
        {
            integrationId: uuid('integration_id').primaryKey().defaultRandom(),
            label: varchar('label', {length: 255}).notNull(),
            ownerId: bigint('owner_id', {mode: 'number'})
                .notNull()
                .references(() => users.id),
            createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
        },
        () => [writerTenantSeparationPolicy(), readerTenantSeparationPolicy(), mcpTenantSeparationPolicy()],
    )
    .enableRLS();

// Per-user MCP query-time budget in a rolling window anchored at the user's first request (lasts
// mcpQuota.windowSeconds). Each window is its own row — closed windows are KEPT as analytics history,
// so a new window inserts a new row. Global (no tenant RLS); written by the app role, never gitgazer_mcp.
export const mcpQueryUsage = gitgazerSchema.table(
    'mcp_query_usage',
    {
        userId: bigint('user_id', {mode: 'number'})
            .notNull()
            .references(() => users.id, {onDelete: 'cascade'}),
        windowStart: timestamp('window_start', {withTimezone: true}).notNull(),
        consumedMs: integer('consumed_ms').notNull().default(0),
    },
    (table) => [primaryKey({columns: [table.userId, table.windowStart]})],
);

// Signs the tenant context. Readable only by its owner: migration 20261029090000_mcp_signed_context revokes the
// default grants and inserts the key row, which Drizzle cannot express.
export const contextKey = gitgazerInternalSchema.table('context_key', {
    id: smallint('id').primaryKey(),
    key: bytea('key').notNull(),
});

export const wsConnections = gitgazerSchema.table(
    'ws_connections',
    {
        integrationId: uuid('integration_id')
            .notNull()
            .references(() => integrations.integrationId, {onDelete: 'cascade'}),
        connectionId: text('connection_id').notNull(),
        userId: bigint('user_id', {mode: 'number'})
            .notNull()
            .references(() => users.id, {onDelete: 'cascade'}),
        connectedAt: timestamp('connected_at', {withTimezone: true}).notNull().defaultNow(),
        channel: varchar('channel', {length: 30, enum: WEBSOCKET_CHANNELS}).notNull(),
    },
    (table) => [
        writerTenantSeparationPolicy(),
        readerTenantSeparationPolicy(),
        primaryKey({
            columns: [table.integrationId, table.connectionId, table.userId],
        }),
        index('ws_connections_connection_id_idx').on(table.connectionId),
        index('ws_connections_integration_channel_idx').on(table.integrationId, table.channel),
    ],
);

export const eventLogEntries = gitgazerSchema
    .table(
        'event_log_entries',
        {
            integrationId: uuid('integration_id')
                .notNull()
                .references(() => integrations.integrationId, {onDelete: 'cascade'}),
            id: uuid('id').defaultRandom().notNull(),
            category: varchar('category', {length: 30, enum: EVENT_LOG_CATEGORIES}).notNull(),
            type: varchar('type', {length: 20, enum: EVENT_LOG_TYPES}).notNull(),
            title: varchar('title', {length: 500}).notNull(),
            message: text('message').notNull(),
            metadata: jsonb('metadata').$type<EventLogEntryMetadata>(),
            read: boolean('read').notNull().default(false),
            createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
        },
        (table) => [
            primaryKey({columns: [table.integrationId, table.id]}),
            writerTenantSeparationPolicy(),
            readerTenantSeparationPolicy(),
            index('event_log_entries_created_at_idx').on(table.integrationId, table.createdAt),
            index('event_log_entries_category_idx').on(table.integrationId, table.category),
            index('event_log_entries_repository_id_idx').on(
                table.integrationId,
                sql`((${table.metadata}->>'repositoryId')::BIGINT)`,
                table.createdAt.desc(),
            ),
        ],
    )
    .enableRLS();

export const integrationInvitations = gitgazerSchema
    .table(
        'integration_invitations',
        {
            integrationId: uuid('integration_id')
                .notNull()
                .references(() => integrations.integrationId, {onDelete: 'cascade'}),
            id: uuid('id').defaultRandom().notNull(),
            email: varchar('email', {length: 255}),
            role: varchar('role', {length: 20, enum: MEMBER_ROLES}).notNull().default('member'),
            invitedBy: bigint('invited_by', {mode: 'number'})
                .notNull()
                .references(() => users.id, {onDelete: 'cascade'}),
            inviteeId: bigint('invitee_id', {mode: 'number'}).references(() => users.id, {onDelete: 'set null'}),
            inviteToken: uuid('invite_token').defaultRandom().notNull().unique(),
            status: varchar('status', {length: 20, enum: INVITATION_STATUSES}).notNull().default('pending'),
            createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
            expiresAt: timestamp('expires_at', {withTimezone: true}).notNull(),
        },
        (table) => [
            primaryKey({columns: [table.integrationId, table.id]}),
            writerTenantSeparationPolicy(),
            readerTenantSeparationPolicy(),
            index('integration_invitations_email_idx').on(table.integrationId, table.email),
            index('integration_invitations_token_idx').on(table.inviteToken),
        ],
    )
    .enableRLS();

export const notificationRules = gitgazerSchema
    .table(
        'notification_rules',
        {
            integrationId: uuid('integration_id')
                .notNull()
                .references(() => integrations.integrationId, {onDelete: 'cascade'}),
            id: uuid('id').defaultRandom().notNull(),
            label: varchar('label', {length: 100}).notNull().default(''),
            enabled: boolean('enabled').notNull().default(true),
            ignore_dependabot: boolean('ignore_dependabot').notNull().default(false),
            include_log_details: boolean('include_log_details').notNull().default(true),
            rule: jsonb('rule').notNull().$type<NotificationRuleRule>(),
            createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
            updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow(),
        },
        (table) => [primaryKey({columns: [table.integrationId, table.id]}), writerTenantSeparationPolicy(), readerTenantSeparationPolicy()],
    )
    .enableRLS();

export const integrationApps = gitgazerSchema
    .table(
        'integration_apps',
        {
            integrationId: uuid('integration_id')
                .notNull()
                .references(() => integrations.integrationId, {onDelete: 'cascade'}),
            appId: uuid('app_id').defaultRandom().notNull(),
            type: varchar('type', {length: 20, enum: INTEGRATION_APP_TYPES}).notNull(),
            createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
        },
        (table) => [
            primaryKey({columns: [table.integrationId, table.appId]}),
            unique().on(table.integrationId, table.type),
            writerTenantSeparationPolicy(),
            readerTenantSeparationPolicy(),
        ],
    )
    .enableRLS();

export const integrationAppGithubSettings = gitgazerSchema
    .table(
        'integration_app_github_settings',
        {
            integrationId: uuid('integration_id')
                .notNull()
                .references(() => integrations.integrationId, {onDelete: 'cascade'}),
            appId: uuid('app_id').notNull(),
            secret: uuid('secret').notNull().defaultRandom(),
            orgSyncDefaultRole: varchar('org_sync_default_role', {length: 20, enum: ORG_SYNC_DEFAULT_ROLES}).notNull().default('viewer'),
        },
        (table) => [
            primaryKey({columns: [table.integrationId, table.appId]}),
            foreignKey({
                columns: [table.integrationId, table.appId],
                foreignColumns: [integrationApps.integrationId, integrationApps.appId],
            }).onDelete('cascade'),
            writerTenantSeparationPolicy(),
            readerTenantSeparationPolicy(),
        ],
    )
    .enableRLS();

// Global (no tenant RLS): one install per Slack workspace, shared by every integration that connects it.
// Not granted to the reader/mcp roles, the bot token ciphertext must stay out of their reach.
export const slackWorkspaces = gitgazerSchema.table('slack_workspaces', {
    teamId: varchar('team_id', {length: 32}).primaryKey().notNull(),
    teamName: varchar('team_name', {length: 255}).notNull(),
    botUserId: varchar('bot_user_id', {length: 32}).notNull(),
    botTokenCiphertext: text('bot_token_ciphertext').notNull(),
    installedBy: bigint('installed_by', {mode: 'number'}).references(() => users.id, {onDelete: 'set null'}),
    installedAt: timestamp('installed_at', {withTimezone: true}).notNull().defaultNow(),
    disconnectedAt: timestamp('disconnected_at', {withTimezone: true}),
});

export const integrationAppSlackSettings = gitgazerSchema
    .table(
        'integration_app_slack_settings',
        {
            integrationId: uuid('integration_id')
                .notNull()
                .references(() => integrations.integrationId, {onDelete: 'cascade'}),
            appId: uuid('app_id').notNull(),
            teamId: varchar('team_id', {length: 32})
                .notNull()
                .references(() => slackWorkspaces.teamId),
        },
        (table) => [
            primaryKey({columns: [table.integrationId, table.appId]}),
            foreignKey({
                columns: [table.integrationId, table.appId],
                foreignColumns: [integrationApps.integrationId, integrationApps.appId],
            }).onDelete('cascade'),
            // Deliberately not led by integrationId: serves the cross-tenant "anyone else using this workspace" check.
            index('integration_app_slack_settings_team_idx').on(table.teamId),
            writerTenantSeparationPolicy(),
            readerTenantSeparationPolicy(),
        ],
    )
    .enableRLS();

export const notificationHandles = gitgazerSchema
    .table(
        'notification_handles',
        {
            integrationId: uuid('integration_id')
                .notNull()
                .references(() => integrations.integrationId, {onDelete: 'cascade'}),
            handleId: uuid('handle_id').defaultRandom().notNull(),
            appId: uuid('app_id').notNull(),
            name: varchar('name', {length: 100}).notNull(),
            createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
            updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow(),
        },
        (table) => [
            primaryKey({columns: [table.integrationId, table.handleId]}),
            foreignKey({
                columns: [table.integrationId, table.appId],
                foreignColumns: [integrationApps.integrationId, integrationApps.appId],
            }).onDelete('cascade'),
            index('notification_handles_integration_app_idx').on(table.integrationId, table.appId),
            writerTenantSeparationPolicy(),
            readerTenantSeparationPolicy(),
        ],
    )
    .enableRLS();

export const webhookHandleDetails = gitgazerSchema
    .table(
        'webhook_handle_details',
        {
            integrationId: uuid('integration_id')
                .notNull()
                .references(() => integrations.integrationId, {onDelete: 'cascade'}),
            handleId: uuid('handle_id').notNull(),
            url: text('url').notNull(),
        },
        (table) => [
            primaryKey({columns: [table.integrationId, table.handleId]}),
            foreignKey({
                columns: [table.integrationId, table.handleId],
                foreignColumns: [notificationHandles.integrationId, notificationHandles.handleId],
            }).onDelete('cascade'),
            writerTenantSeparationPolicy(),
            readerTenantSeparationPolicy(),
        ],
    )
    .enableRLS();

export const slackHandleDetails = gitgazerSchema
    .table(
        'slack_handle_details',
        {
            integrationId: uuid('integration_id')
                .notNull()
                .references(() => integrations.integrationId, {onDelete: 'cascade'}),
            handleId: uuid('handle_id').notNull(),
            channelId: varchar('channel_id', {length: 32}).notNull(),
            channelName: varchar('channel_name', {length: 255}).notNull(),
        },
        (table) => [
            primaryKey({columns: [table.integrationId, table.handleId]}),
            foreignKey({
                columns: [table.integrationId, table.handleId],
                foreignColumns: [notificationHandles.integrationId, notificationHandles.handleId],
            }).onDelete('cascade'),
            writerTenantSeparationPolicy(),
            readerTenantSeparationPolicy(),
        ],
    )
    .enableRLS();

// Global (no tenant RLS), like slackWorkspaces. A null slackUserId records that the lookup found no match.
export const slackUserLinks = gitgazerSchema.table(
    'slack_user_links',
    {
        teamId: varchar('team_id', {length: 32})
            .notNull()
            .references(() => slackWorkspaces.teamId, {onDelete: 'cascade'}),
        githubUserId: bigint('github_user_id', {mode: 'number'}).notNull(),
        slackUserId: varchar('slack_user_id', {length: 32}),
        source: varchar('source', {length: 30, enum: SLACK_LINK_SOURCES}),
        checkedAt: timestamp('checked_at', {withTimezone: true}).notNull(),
        autoLinkBlocked: boolean('auto_link_blocked').notNull().default(false),
    },
    (table) => [primaryKey({columns: [table.teamId, table.githubUserId]})],
);

export const notificationRuleDestinations = gitgazerSchema
    .table(
        'notification_rule_destinations',
        {
            integrationId: uuid('integration_id')
                .notNull()
                .references(() => integrations.integrationId, {onDelete: 'cascade'}),
            ruleId: uuid('rule_id').notNull(),
            handleId: uuid('handle_id').notNull(),
        },
        (table) => [
            primaryKey({columns: [table.integrationId, table.ruleId, table.handleId]}),
            foreignKey({
                columns: [table.integrationId, table.ruleId],
                foreignColumns: [notificationRules.integrationId, notificationRules.id],
            }).onDelete('cascade'),
            foreignKey({
                columns: [table.integrationId, table.handleId],
                foreignColumns: [notificationHandles.integrationId, notificationHandles.handleId],
            }).onDelete('cascade'),
            index('notification_rule_destinations_integration_handle_idx').on(table.integrationId, table.handleId),
            writerTenantSeparationPolicy(),
            readerTenantSeparationPolicy(),
        ],
    )
    .enableRLS();
