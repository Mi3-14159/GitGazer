-- Custom SQL migration file, put your code below! --
-- The functions below run as their owner, and only the owner may call the sign function, so the owner must be the app's login.
DO $$
BEGIN
    IF current_user <> 'root' THEN
        RAISE EXCEPTION 'run this migration as root, the app login, not as %', current_user;
    END IF;
END
$$;--> statement-breakpoint
CREATE TABLE "gitgazer"."mcp_context_key" (
	"id" smallint PRIMARY KEY,
	"key" bytea NOT NULL
);
--> statement-breakpoint
INSERT INTO gitgazer.mcp_context_key (id, key) VALUES (1, public.gen_random_bytes(32));--> statement-breakpoint
REVOKE ALL ON gitgazer.mcp_context_key FROM PUBLIC, gitgazer_user, gitgazer_reader, gitgazer_writer;--> statement-breakpoint
CREATE FUNCTION gitgazer.mcp_sign_context(p_payload text, p_pid integer, p_txn_start_us bigint)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT encode(public.hmac(convert_to(p_payload || '|' || p_pid || '|' || p_txn_start_us, 'UTF8'), key, 'sha256'), 'hex')
    FROM gitgazer.mcp_context_key
    WHERE id = 1
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION gitgazer.mcp_sign_context(text, integer, bigint) FROM PUBLIC;--> statement-breakpoint
-- Only the matched payload reaches the uuid cast, so a forged or malformed setting yields no rows instead of an error.
CREATE FUNCTION github.mcp_context()
RETURNS TABLE (integration_id uuid, role text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
    WITH context AS (
        SELECT regexp_match(current_setting('rls.mcp_context', TRUE), '^([^|]*)\|([0-9a-f]{64})$') AS parts
    ),
    verified AS (
        SELECT context.parts[1] AS payload
        FROM context, gitgazer.mcp_context_key
        WHERE mcp_context_key.id = 1
            AND context.parts[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[a-z]+(,[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[a-z]+)*$'
            AND context.parts[2] = encode(public.hmac(convert_to(
                context.parts[1] || '|' || pg_backend_pid() || '|' || (extract(epoch FROM now()) * 1000000)::bigint, 'UTF8'
            ), mcp_context_key.key, 'sha256'), 'hex')
    )
    SELECT split_part(entry, ':', 1)::uuid, split_part(entry, ':', 2)
    FROM verified, unnest(string_to_array(verified.payload, ',')) AS entry
$$;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION github.mcp_context() TO gitgazer_mcp;--> statement-breakpoint
CREATE FUNCTION github.mcp_integration_ids(p_minimum_role text DEFAULT 'viewer')
RETURNS uuid[]
LANGUAGE sql STABLE
SET search_path = pg_catalog, pg_temp
AS $$
    WITH ranks(role, rank) AS (VALUES ('owner', 0), ('admin', 1), ('member', 2), ('viewer', 3))
    SELECT COALESCE(array_agg(context.integration_id), '{}')
    FROM github.mcp_context() AS context
    JOIN ranks AS caller ON caller.role = context.role
    JOIN ranks AS required ON required.role = p_minimum_role
    WHERE caller.rank <= required.rank
$$;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION github.mcp_integration_ids(text) TO gitgazer_mcp;--> statement-breakpoint
ALTER POLICY "tenant separation mcp" ON "github"."enterprises" TO "gitgazer_mcp" USING (integration_id = ANY ((SELECT github.mcp_integration_ids())::uuid[]));--> statement-breakpoint
ALTER POLICY "tenant separation mcp" ON "github"."integrations" TO "gitgazer_mcp" USING (integration_id = ANY ((SELECT github.mcp_integration_ids())::uuid[]));--> statement-breakpoint
ALTER POLICY "tenant separation mcp" ON "github"."organizations" TO "gitgazer_mcp" USING (integration_id = ANY ((SELECT github.mcp_integration_ids())::uuid[]));--> statement-breakpoint
ALTER POLICY "tenant separation mcp" ON "github"."pull_request_reviews" TO "gitgazer_mcp" USING (integration_id = ANY ((SELECT github.mcp_integration_ids())::uuid[]));--> statement-breakpoint
ALTER POLICY "tenant separation mcp" ON "github"."pull_requests" TO "gitgazer_mcp" USING (integration_id = ANY ((SELECT github.mcp_integration_ids())::uuid[]));--> statement-breakpoint
ALTER POLICY "tenant separation mcp" ON "github"."repositories" TO "gitgazer_mcp" USING (integration_id = ANY ((SELECT github.mcp_integration_ids())::uuid[]));--> statement-breakpoint
ALTER POLICY "tenant separation mcp" ON "github"."user" TO "gitgazer_mcp" USING (integration_id = ANY ((SELECT github.mcp_integration_ids())::uuid[]));--> statement-breakpoint
ALTER POLICY "tenant separation mcp" ON "github"."workflow_jobs" TO "gitgazer_mcp" USING (integration_id = ANY ((SELECT github.mcp_integration_ids())::uuid[]));--> statement-breakpoint
ALTER POLICY "tenant separation mcp" ON "github"."workflow_run_pull_requests" TO "gitgazer_mcp" USING (integration_id = ANY ((SELECT github.mcp_integration_ids())::uuid[]));--> statement-breakpoint
ALTER POLICY "tenant separation mcp" ON "github"."workflow_runs" TO "gitgazer_mcp" USING (integration_id = ANY ((SELECT github.mcp_integration_ids())::uuid[]));--> statement-breakpoint
DROP FUNCTION github.mcp_has_role(uuid, text);
