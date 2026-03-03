import {bigint, pgSchema, uuid} from 'drizzle-orm/pg-core';

export const gitgazerSchema = pgSchema('gitgazer');

export const users = gitgazerSchema.table('users', {
    id: bigint('id', {mode: 'number'}).primaryKey().notNull().generatedAlwaysAsIdentity(),
    cognitoId: uuid('cognito_id').notNull().unique(),
});
