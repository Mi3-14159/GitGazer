import {PgDialect} from 'drizzle-orm/pg-core';
import {describe, expect, it} from 'vitest';
import {gitgazerMcp} from '../app';
import {mcpRolePolicy} from './misc';

describe('mcpRolePolicy', () => {
    it('is a select-only policy for gitgazer_mcp that combines the tenant check with the role check', () => {
        const policy = mcpRolePolicy('admin');
        expect(policy.to).toBe(gitgazerMcp);
        expect(policy.for).toBe('select');
        const using = new PgDialect().sqlToQuery(policy.using!).sql;
        expect(using).toContain("current_setting('rls.integration_ids', TRUE)");
        expect(using).toContain("github.mcp_has_role(integration_id, 'admin')");
    });
});
