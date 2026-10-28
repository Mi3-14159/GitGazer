import {sql} from 'drizzle-orm';
import {pgPolicy, pgSchema} from 'drizzle-orm/pg-core';
import type {MemberRole} from '../../types/members';
import {gitgazerMcp, gitgazerReader, gitgazerWriter} from '../app';

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

export const mcpTenantSeparationPolicy = () =>
    pgPolicy('tenant separation mcp', {
        as: 'permissive',
        to: gitgazerMcp,
        for: 'select',
        using: sql`integration_id = ANY ((SELECT github.mcp_integration_ids())::uuid[])`,
    });

export const mcpRolePolicy = (minimumRole: MemberRole) =>
    pgPolicy(`tenant separation mcp ${minimumRole}`, {
        as: 'permissive',
        to: gitgazerMcp,
        for: 'select',
        using: sql`integration_id = ANY ((SELECT github.mcp_integration_ids(${sql.raw(`'${minimumRole}'`)}))::uuid[])`,
    });
