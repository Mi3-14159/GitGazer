import {sql} from 'drizzle-orm';
import {bigint, boolean, jsonb, text, timestamp, uuid, varchar} from 'drizzle-orm/pg-core';
import {
    EVENT_LOG_CATEGORIES,
    EVENT_LOG_TYPES,
    INTEGRATION_APP_TYPES,
    INVITATION_STATUSES,
    MEMBER_ASSIGNMENT_SOURCES,
    MEMBER_ROLES,
    ORG_SYNC_DEFAULT_ROLES,
    type EventLogEntryMetadata,
    type MemberRole,
    type NotificationRuleRule,
} from '../../types';
import {githubSchema} from './misc';

// The views run as their owner, so base-table RLS does not apply: these filters are the tenant boundary.
const rowsFor = (minimumRole: MemberRole) => `integration_id = ANY ((SELECT github.integration_ids('${minimumRole}'))::uuid[])`;

const onlyFor = (minimumRole: MemberRole, column: string) => `CASE WHEN ${rowsFor(minimumRole)} THEN ${column} END AS ${column}`;

const usersFor = (minimumRole: MemberRole) => `SELECT user_id FROM github."user-assignments" WHERE ${rowsFor(minimumRole)}`;

export const integrationAppsView = githubSchema
    .view('integration_apps', {
        integrationId: uuid('integration_id').notNull(),
        appId: uuid('app_id').notNull(),
        type: varchar('type', {length: 20, enum: INTEGRATION_APP_TYPES}).notNull(),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
    })
    .with({securityBarrier: true})
    .as(sql.raw(`SELECT integration_id, app_id, type, created_at FROM gitgazer.integration_apps WHERE ${rowsFor('viewer')}`));

export const integrationAppGithubSettingsView = githubSchema
    .view('integration_app_github_settings', {
        integrationId: uuid('integration_id').notNull(),
        appId: uuid('app_id').notNull(),
        secret: uuid('secret'),
        orgSyncDefaultRole: varchar('org_sync_default_role', {length: 20, enum: ORG_SYNC_DEFAULT_ROLES}).notNull(),
    })
    .with({securityBarrier: true})
    .as(
        sql.raw(
            `SELECT integration_id, app_id, ${onlyFor('admin', 'secret')}, org_sync_default_role FROM gitgazer.integration_app_github_settings WHERE ${rowsFor('viewer')}`,
        ),
    );

export const integrationAppSlackSettingsView = githubSchema
    .view('integration_app_slack_settings', {
        integrationId: uuid('integration_id').notNull(),
        appId: uuid('app_id').notNull(),
        teamId: varchar('team_id', {length: 32}).notNull(),
    })
    .with({securityBarrier: true})
    .as(sql.raw(`SELECT integration_id, app_id, team_id FROM gitgazer.integration_app_slack_settings WHERE ${rowsFor('viewer')}`));

export const notificationHandlesView = githubSchema
    .view('notification_handles', {
        integrationId: uuid('integration_id').notNull(),
        handleId: uuid('handle_id').notNull(),
        appId: uuid('app_id').notNull(),
        name: varchar('name', {length: 100}).notNull(),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
        updatedAt: timestamp('updated_at', {withTimezone: true}).notNull(),
    })
    .with({securityBarrier: true})
    .as(
        sql.raw(
            `SELECT integration_id, handle_id, app_id, name, created_at, updated_at FROM gitgazer.notification_handles WHERE ${rowsFor('viewer')}`,
        ),
    );

export const webhookHandleDetailsView = githubSchema
    .view('webhook_handle_details', {
        integrationId: uuid('integration_id').notNull(),
        handleId: uuid('handle_id').notNull(),
        url: text('url'),
    })
    .with({securityBarrier: true})
    .as(sql.raw(`SELECT integration_id, handle_id, ${onlyFor('admin', 'url')} FROM gitgazer.webhook_handle_details WHERE ${rowsFor('viewer')}`));

export const slackHandleDetailsView = githubSchema
    .view('slack_handle_details', {
        integrationId: uuid('integration_id').notNull(),
        handleId: uuid('handle_id').notNull(),
        channelId: varchar('channel_id', {length: 32}).notNull(),
        channelName: varchar('channel_name', {length: 255}).notNull(),
    })
    .with({securityBarrier: true})
    .as(sql.raw(`SELECT integration_id, handle_id, channel_id, channel_name FROM gitgazer.slack_handle_details WHERE ${rowsFor('viewer')}`));

export const notificationRulesView = githubSchema
    .view('notification_rules', {
        integrationId: uuid('integration_id').notNull(),
        id: uuid('id').notNull(),
        label: varchar('label', {length: 100}).notNull(),
        enabled: boolean('enabled').notNull(),
        ignore_dependabot: boolean('ignore_dependabot').notNull(),
        include_log_details: boolean('include_log_details').notNull(),
        rule: jsonb('rule').notNull().$type<NotificationRuleRule>(),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
        updatedAt: timestamp('updated_at', {withTimezone: true}).notNull(),
    })
    .with({securityBarrier: true})
    .as(
        sql.raw(
            `SELECT integration_id, id, label, enabled, ignore_dependabot, include_log_details, rule, created_at, updated_at FROM gitgazer.notification_rules WHERE ${rowsFor('viewer')}`,
        ),
    );

export const notificationRuleDestinationsView = githubSchema
    .view('notification_rule_destinations', {
        integrationId: uuid('integration_id').notNull(),
        ruleId: uuid('rule_id').notNull(),
        handleId: uuid('handle_id').notNull(),
    })
    .with({securityBarrier: true})
    .as(sql.raw(`SELECT integration_id, rule_id, handle_id FROM gitgazer.notification_rule_destinations WHERE ${rowsFor('viewer')}`));

export const integrationInvitationsView = githubSchema
    .view('integration_invitations', {
        integrationId: uuid('integration_id').notNull(),
        id: uuid('id').notNull(),
        email: varchar('email', {length: 255}),
        role: varchar('role', {length: 20, enum: MEMBER_ROLES}).notNull(),
        invitedBy: bigint('invited_by', {mode: 'number'}).notNull(),
        inviteeId: bigint('invitee_id', {mode: 'number'}),
        inviteToken: uuid('invite_token'),
        status: varchar('status', {length: 20, enum: INVITATION_STATUSES}).notNull(),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
        expiresAt: timestamp('expires_at', {withTimezone: true}).notNull(),
    })
    .with({securityBarrier: true})
    .as(
        sql.raw(
            `SELECT integration_id, id, ${onlyFor('admin', 'email')}, role, invited_by, invitee_id, ${onlyFor('admin', 'invite_token')}, status, created_at, expires_at FROM gitgazer.integration_invitations WHERE ${rowsFor('member')}`,
        ),
    );

export const eventLogEntriesView = githubSchema
    .view('event_log_entries', {
        integrationId: uuid('integration_id').notNull(),
        id: uuid('id').notNull(),
        category: varchar('category', {length: 30, enum: EVENT_LOG_CATEGORIES}).notNull(),
        type: varchar('type', {length: 20, enum: EVENT_LOG_TYPES}).notNull(),
        title: varchar('title', {length: 500}).notNull(),
        message: text('message').notNull(),
        metadata: jsonb('metadata').$type<EventLogEntryMetadata>(),
        read: boolean('read').notNull(),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
    })
    .with({securityBarrier: true})
    .as(
        sql.raw(
            `SELECT integration_id, id, category, type, title, message, metadata, read, created_at FROM gitgazer.event_log_entries WHERE ${rowsFor('viewer')}`,
        ),
    );

// Named apart from the "user-assignments" table, which shares the schema.
export const userAssignmentsView = githubSchema
    .view('user_assignments', {
        integrationId: uuid('integration_id').notNull(),
        userId: bigint('user_id', {mode: 'number'}).notNull(),
        role: varchar('role', {length: 20, enum: MEMBER_ROLES}).notNull(),
        source: varchar('source', {length: 20, enum: MEMBER_ASSIGNMENT_SOURCES}).notNull(),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
    })
    .with({securityBarrier: true})
    .as(sql.raw(`SELECT integration_id, user_id, role, source, created_at FROM github."user-assignments" WHERE ${rowsFor('viewer')}`));

export const usersView = githubSchema
    .view('users', {
        id: bigint('id', {mode: 'number'}).notNull(),
        email: varchar('email', {length: 255}),
        name: varchar('name', {length: 255}),
        picture: text('picture'),
        githubLogin: varchar('github_login', {length: 255}),
        lastActiveAt: timestamp('last_active_at', {withTimezone: true}),
    })
    .with({securityBarrier: true})
    .as(
        sql.raw(
            `SELECT id, CASE WHEN id IN (${usersFor('admin')}) THEN email END AS email, name, picture, github_login, last_active_at FROM gitgazer.users WHERE id IN (${usersFor('viewer')})`,
        ),
    );

export const slackWorkspacesView = githubSchema
    .view('slack_workspaces', {
        teamId: varchar('team_id', {length: 32}).notNull(),
        teamName: varchar('team_name', {length: 255}).notNull(),
        botUserId: varchar('bot_user_id', {length: 32}).notNull(),
        installedBy: bigint('installed_by', {mode: 'number'}),
        installedAt: timestamp('installed_at', {withTimezone: true}).notNull(),
        disconnectedAt: timestamp('disconnected_at', {withTimezone: true}),
    })
    .with({securityBarrier: true})
    .as(
        sql.raw(
            `SELECT team_id, team_name, bot_user_id, CASE WHEN installed_by IN (${usersFor('viewer')}) THEN installed_by END AS installed_by, installed_at, disconnected_at FROM gitgazer.slack_workspaces WHERE team_id IN (SELECT team_id FROM gitgazer.integration_app_slack_settings WHERE ${rowsFor('viewer')})`,
        ),
    );
