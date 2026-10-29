ALTER TABLE gitgazer.mcp_context_key RENAME TO context_key;
--> statement-breakpoint
ALTER FUNCTION gitgazer.mcp_sign_context(text, integer, bigint) RENAME TO sign_context;
--> statement-breakpoint
ALTER FUNCTION github.mcp_context() RENAME TO signed_context;
--> statement-breakpoint
ALTER FUNCTION github.mcp_integration_ids(text) RENAME TO integration_ids;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION gitgazer.sign_context(p_payload text, p_pid integer, p_txn_start_us bigint)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT encode(public.hmac(convert_to(p_payload || '|' || p_pid || '|' || p_txn_start_us, 'UTF8'), key, 'sha256'), 'hex')
    FROM gitgazer.context_key
    WHERE id = 1
$$;
--> statement-breakpoint
-- Only the matched payload reaches the uuid cast, so a forged or malformed setting yields no rows instead of an error.
CREATE OR REPLACE FUNCTION github.signed_context()
RETURNS TABLE (integration_id uuid, role text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
    WITH context AS (
        SELECT regexp_match(current_setting('rls.signed_context', TRUE), '^([^|]*)\|([0-9a-f]{64})$') AS parts
    ),
    verified AS (
        SELECT context.parts[1] AS payload
        FROM context, gitgazer.context_key
        WHERE context_key.id = 1
            AND context.parts[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[a-z]+(,[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[a-z]+)*$'
            AND context.parts[2] = encode(public.hmac(convert_to(
                context.parts[1] || '|' || pg_backend_pid() || '|' || (extract(epoch FROM now()) * 1000000)::bigint, 'UTF8'
            ), context_key.key, 'sha256'), 'hex')
    )
    SELECT split_part(entry, ':', 1)::uuid, split_part(entry, ':', 2)
    FROM verified, unnest(string_to_array(verified.payload, ',')) AS entry
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION github.integration_ids(p_minimum_role text DEFAULT 'viewer')
RETURNS uuid[]
LANGUAGE sql STABLE
SET search_path = pg_catalog, pg_temp
AS $$
    WITH ranks(role, rank) AS (VALUES ('owner', 0), ('admin', 1), ('member', 2), ('viewer', 3))
    SELECT COALESCE(array_agg(context.integration_id), '{}')
    FROM github.signed_context() AS context
    JOIN ranks AS caller ON caller.role = context.role
    JOIN ranks AS required ON required.role = p_minimum_role
    WHERE caller.rank <= required.rank
$$;
