-- Defense-in-depth for the MCP raw-SQL path (gitgazer_mcp): revoke EXECUTE on set_config() so
-- the `rls.integration_ids` GUC cannot be overwritten from inside a read-only SELECT, which
-- would otherwise bypass row-level security and expose another tenant's rows. The transaction
-- wrapper in packages/db/src/client.ts uses the `SET LOCAL` *statement* (not this function), so
-- no legitimate code path is affected.
--
-- NOTE: the authoritative control is the SQL-layer guard in
-- packages/db/src/queries/readonlyQuery.ts (assertReadOnlySelect). On managed Postgres
-- (RDS/Aurora) the connecting role may not own pg_catalog.set_config and therefore cannot revoke
-- its default PUBLIC grant; in that case this REVOKE is a no-op and we fall back to that guard.
-- The attempt is wrapped so a permission failure never blocks the migration chain.
DO $$
BEGIN
    REVOKE EXECUTE ON FUNCTION pg_catalog.set_config(text, text, boolean) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION pg_catalog.set_config(text, text, boolean) FROM gitgazer_mcp;
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE WARNING 'Could not REVOKE EXECUTE on set_config (managed-DB limitation); relying on the app-layer guard in readonlyQuery.ts';
END
$$;
