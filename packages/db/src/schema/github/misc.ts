import {sql} from 'drizzle-orm';
import {pgPolicy, pgSchema} from 'drizzle-orm/pg-core';
import {gitgazerAnalyst, gitgazerReader, gitgazerWriter} from '../app';

export const githubSchema = pgSchema('github');

const using = sql`integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[])`;

export const writerTenantSeparationPolicy = () =>
    pgPolicy('tenant separation writer', {
        as: 'permissive',
        to: gitgazerWriter,
        for: 'all',
        using,
    });

export const readerTenantSeparationPolicy = () =>
    pgPolicy('tenant separation reader', {
        as: 'permissive',
        to: gitgazerReader,
        for: 'select',
        using,
    });

export const analystTenantSeparationPolicy = () =>
    pgPolicy('tenant separation analyst', {
        as: 'permissive',
        to: gitgazerAnalyst,
        for: 'select',
        using,
    });
