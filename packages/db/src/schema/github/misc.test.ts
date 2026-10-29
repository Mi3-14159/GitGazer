import {PgDialect} from 'drizzle-orm/pg-core';
import {describe, expect, it} from 'vitest';
import {gitgazerMcp} from '../app';
import {mcpRolePolicy, mcpTenantSeparationPolicy} from './misc';

const render = (policy: ReturnType<typeof mcpTenantSeparationPolicy>) => new PgDialect().sqlToQuery(policy.using!).sql;

describe('mcpTenantSeparationPolicy', () => {
    it('is a select-only policy for gitgazer_mcp that checks the signed context once per table, not per row', () => {
        const policy = mcpTenantSeparationPolicy();
        expect(policy.to).toBe(gitgazerMcp);
        expect(policy.for).toBe('select');
        const using = render(policy);
        expect(using).toContain('(SELECT github.integration_ids())::uuid[]');
        expect(using).not.toContain('mcp_has_role');
    });
});

describe('mcpRolePolicy', () => {
    it('is a select-only policy for gitgazer_mcp limited to integrations where the caller has the role', () => {
        const policy = mcpRolePolicy('admin');
        expect(policy.to).toBe(gitgazerMcp);
        expect(policy.for).toBe('select');
        const using = render(policy);
        expect(using).toContain("(SELECT github.integration_ids('admin'))::uuid[]");
        expect(using).not.toContain('mcp_has_role');
    });
});
