import {bigint, pgSchema, text, timestamp, uuid} from 'drizzle-orm/pg-core';
import {integrations} from './github';

export const gitgazerSchema = pgSchema('gitgazer');

export const users = gitgazerSchema.table('users', {
    id: bigint('id', {mode: 'number'}).primaryKey().notNull().generatedAlwaysAsIdentity(),
    cognitoId: uuid('cognito_id').notNull().unique(),
});

export const wsConnections = gitgazerSchema.table('ws_connections', {
    integrationId: uuid('integration_id')
        .notNull()
        .references(() => integrations.integrationId, {onDelete: 'cascade'}),
    connectionId: text('connection_id').notNull().unique(),
    userId: bigint('user_id', {mode: 'number'})
        .notNull()
        .references(() => users.id, {onDelete: 'cascade'}),
    connectedAt: timestamp('connected_at', {withTimezone: true}).notNull().defaultNow(),
});
