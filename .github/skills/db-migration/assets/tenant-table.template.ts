// Tenant-scoped table template for the `github` schema.
// Copy into packages/db/src/schema/github/<file>.ts and rename `myEntities` / `my_entities`.
// For the `gitgazer` schema instead, use gitgazerSchema from '../gitgazer' and import the
// policy helpers from './github' (they are re-exported there).
//
// RULES (see ../SKILL.md):
//  - integrationId uuid → references integrations.integrationId, onDelete: 'cascade'
//  - composite primary key with integrationId FIRST
//  - writer + reader tenant-separation policies + .enableRLS() are MANDATORY for tenant data
//  - analyst policy ONLY if the analytics/Bedrock layer must read this table

import { relations } from 'drizzle-orm';
import { bigint, index, primaryKey, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import {
    githubSchema,
    readerTenantSeparationPolicy,
    writerTenantSeparationPolicy,
} from './misc';
import { integrations } from './workflows';

export const myEntities = githubSchema
    .table(
        'my_entities',
        {
            integrationId: uuid('integration_id')
                .notNull()
                .references(() => integrations.integrationId, {onDelete: 'cascade'}),
            id: bigint('id', {mode: 'number'}).notNull(),
            name: varchar('name', {length: 255}).notNull(),
            createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
        },
        (table) => [
            primaryKey({columns: [table.integrationId, table.id]}),
            writerTenantSeparationPolicy(),
            readerTenantSeparationPolicy(),
            // analystTenantSeparationPolicy(),
            index('my_entities_name_idx').on(table.integrationId, table.name),
        ],
    )
    .enableRLS();

// Define relations only if you query this table with `.with`.
export const myEntitiesRelations = relations(myEntities, ({one}) => ({
    integration: one(integrations, {
        fields: [myEntities.integrationId],
        references: [integrations.integrationId],
    }),
}));
