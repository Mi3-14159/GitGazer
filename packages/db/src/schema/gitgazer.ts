import type {NotificationRuleChannel, NotificationRuleRule} from '../types';
import {bigint, boolean, index, jsonb, pgSchema, primaryKey, text, timestamp, uuid} from 'drizzle-orm/pg-core';
import {integrations, tenantSeparationPolicy} from './github';

export const gitgazerSchema = pgSchema('gitgazer');

export const users = gitgazerSchema.table('users', {
    id: bigint('id', {mode: 'number'}).primaryKey().notNull().generatedAlwaysAsIdentity(),
    cognitoId: uuid('cognito_id').notNull().unique(),
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
    },
    (table) => [
        tenantSeparationPolicy(),
        primaryKey({
            columns: [table.integrationId, table.connectionId, table.userId],
        }),
        index('ws_connections_connection_id_idx').on(table.connectionId),
    ],
);

export const notificationRules = gitgazerSchema
    .table(
        'notification_rules',
        {
            integrationId: uuid('integration_id')
                .notNull()
                .references(() => integrations.integrationId, {onDelete: 'cascade'}),
            id: uuid('id').defaultRandom().notNull(),
            channels: jsonb('channels').notNull().$type<NotificationRuleChannel[]>(),
            enabled: boolean('enabled').notNull().default(true),
            ignore_dependabot: boolean('ignore_dependabot').notNull().default(false),
            rule: jsonb('rule').notNull().$type<NotificationRuleRule>(),
            createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
            updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow(),
        },
        (table) => [primaryKey({columns: [table.integrationId, table.id]}), tenantSeparationPolicy()],
    )
    .enableRLS();
