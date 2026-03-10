import {sql} from 'drizzle-orm';
import {pgPolicy, pgSchema} from 'drizzle-orm/pg-core';
import {gitgazerReader, gitgazerWriter} from '../app';

export const githubSchema = pgSchema('github');

const using = sql`integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[])`;

export const tenantSeparationPolicy = () => [
    pgPolicy('tenant separation writer', {
        as: 'permissive',
        to: gitgazerWriter,
        for: 'all',
        using,
    }),
    pgPolicy('tenant separation reader', {
        as: 'permissive',
        to: gitgazerReader,
        for: 'select',
        using,
    }),
];
