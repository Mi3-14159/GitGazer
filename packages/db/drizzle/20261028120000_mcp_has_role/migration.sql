-- Custom SQL migration file, put your code below! --
CREATE OR REPLACE FUNCTION github.mcp_has_role(p_integration_id uuid, p_minimum_role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
    WITH ranks(role, rank) AS (VALUES ('owner', 0), ('admin', 1), ('member', 2), ('viewer', 3)),
    entries AS (
        SELECT split_part(entry, ':', 1) AS integration_id, split_part(entry, ':', 2) AS role
        FROM unnest(string_to_array(NULLIF(current_setting('rls.integration_roles', TRUE), ''), ',')) AS entry
    )
    SELECT COALESCE((
        SELECT caller.rank <= required.rank
        FROM entries
        JOIN ranks AS caller ON caller.role = entries.role
        JOIN ranks AS required ON required.role = $2
        WHERE entries.integration_id = $1::text
    ), FALSE)
$$;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION github.mcp_has_role(uuid, text) TO gitgazer_mcp;
