import {relations} from 'drizzle-orm';
import {bigint, boolean, index, jsonb, pgSchema, primaryKey, text, timestamp, uuid, varchar} from 'drizzle-orm/pg-core';
import {
    EVENT_LOG_CATEGORIES,
    EVENT_LOG_TYPES,
    INVITATION_STATUSES,
    MEMBER_ROLES,
    WEBSOCKET_CHANNELS,
    type EventLogEntryMetadata,
    type NotificationRuleChannel,
    type NotificationRuleRule,
} from '../types';
import {integrations, readerTenantSeparationPolicy, writerTenantSeparationPolicy} from './github';

export const gitgazerSchema = pgSchema('gitgazer');

export const users = gitgazerSchema.table('users', {
    id: bigint('id', {mode: 'number'}).primaryKey().notNull().generatedAlwaysAsIdentity(),
    cognitoId: uuid('cognito_id').notNull().unique(),
    email: varchar('email', {length: 255}),
    name: varchar('name', {length: 255}),
    picture: text('picture'),
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

export const integrationInvitationsRelations = relations(integrationInvitations, ({one}) => ({
    invitedByUser: one(users, {
        fields: [integrationInvitations.invitedBy],
        references: [users.id],
        relationName: 'invitedByUser',
    }),
    invitee: one(users, {
        fields: [integrationInvitations.inviteeId],
        references: [users.id],
        relationName: 'invitee',
    }),
}));

export const notificationRules = gitgazerSchema
    .table(
        'notification_rules',
        {
            integrationId: uuid('integration_id')
                .notNull()
                .references(() => integrations.integrationId, {onDelete: 'cascade'}),
            id: uuid('id').defaultRandom().notNull(),
            label: varchar('label', {length: 100}).notNull().default(''),
            channels: jsonb('channels').notNull().$type<NotificationRuleChannel[]>(),
            enabled: boolean('enabled').notNull().default(true),
            ignore_dependabot: boolean('ignore_dependabot').notNull().default(false),
            rule: jsonb('rule').notNull().$type<NotificationRuleRule>(),
            createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
            updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow(),
        },
        (table) => [primaryKey({columns: [table.integrationId, table.id]}), writerTenantSeparationPolicy(), readerTenantSeparationPolicy()],
    )
    .enableRLS();
