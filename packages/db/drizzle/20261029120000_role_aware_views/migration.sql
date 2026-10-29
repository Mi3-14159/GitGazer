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
--> statement-breakpoint
CREATE VIEW "github"."event_log_entries" WITH (security_barrier = true) AS (SELECT integration_id, id, category, type, title, message, metadata, read, created_at FROM gitgazer.event_log_entries WHERE integration_id = ANY ((SELECT github.integration_ids('viewer'))::uuid[]));
--> statement-breakpoint
GRANT SELECT ON github.event_log_entries TO gitgazer_mcp;
--> statement-breakpoint
CREATE VIEW "github"."integration_app_github_settings" WITH (security_barrier = true) AS (SELECT integration_id, app_id, CASE WHEN integration_id = ANY ((SELECT github.integration_ids('admin'))::uuid[]) THEN secret END AS secret, org_sync_default_role FROM gitgazer.integration_app_github_settings WHERE integration_id = ANY ((SELECT github.integration_ids('viewer'))::uuid[]));
--> statement-breakpoint
GRANT SELECT ON github.integration_app_github_settings TO gitgazer_mcp;
--> statement-breakpoint
CREATE VIEW "github"."integration_app_slack_settings" WITH (security_barrier = true) AS (SELECT integration_id, app_id, team_id FROM gitgazer.integration_app_slack_settings WHERE integration_id = ANY ((SELECT github.integration_ids('viewer'))::uuid[]));
--> statement-breakpoint
GRANT SELECT ON github.integration_app_slack_settings TO gitgazer_mcp;
--> statement-breakpoint
CREATE VIEW "github"."integration_apps" WITH (security_barrier = true) AS (SELECT integration_id, app_id, type, created_at FROM gitgazer.integration_apps WHERE integration_id = ANY ((SELECT github.integration_ids('viewer'))::uuid[]));
--> statement-breakpoint
GRANT SELECT ON github.integration_apps TO gitgazer_mcp;
--> statement-breakpoint
CREATE VIEW "github"."integration_invitations" WITH (security_barrier = true) AS (SELECT integration_id, id, CASE WHEN integration_id = ANY ((SELECT github.integration_ids('admin'))::uuid[]) THEN email END AS email, role, invited_by, invitee_id, CASE WHEN integration_id = ANY ((SELECT github.integration_ids('admin'))::uuid[]) THEN invite_token END AS invite_token, status, created_at, expires_at FROM gitgazer.integration_invitations WHERE integration_id = ANY ((SELECT github.integration_ids('member'))::uuid[]));
--> statement-breakpoint
GRANT SELECT ON github.integration_invitations TO gitgazer_mcp;
--> statement-breakpoint
CREATE VIEW "github"."notification_handles" WITH (security_barrier = true) AS (SELECT integration_id, handle_id, app_id, name, created_at, updated_at FROM gitgazer.notification_handles WHERE integration_id = ANY ((SELECT github.integration_ids('viewer'))::uuid[]));
--> statement-breakpoint
GRANT SELECT ON github.notification_handles TO gitgazer_mcp;
--> statement-breakpoint
CREATE VIEW "github"."notification_rule_destinations" WITH (security_barrier = true) AS (SELECT integration_id, rule_id, handle_id FROM gitgazer.notification_rule_destinations WHERE integration_id = ANY ((SELECT github.integration_ids('viewer'))::uuid[]));
--> statement-breakpoint
GRANT SELECT ON github.notification_rule_destinations TO gitgazer_mcp;
--> statement-breakpoint
CREATE VIEW "github"."notification_rules" WITH (security_barrier = true) AS (SELECT integration_id, id, label, enabled, ignore_dependabot, include_log_details, rule, created_at, updated_at FROM gitgazer.notification_rules WHERE integration_id = ANY ((SELECT github.integration_ids('viewer'))::uuid[]));
--> statement-breakpoint
GRANT SELECT ON github.notification_rules TO gitgazer_mcp;
--> statement-breakpoint
CREATE VIEW "github"."slack_handle_details" WITH (security_barrier = true) AS (SELECT integration_id, handle_id, channel_id, channel_name FROM gitgazer.slack_handle_details WHERE integration_id = ANY ((SELECT github.integration_ids('viewer'))::uuid[]));
--> statement-breakpoint
GRANT SELECT ON github.slack_handle_details TO gitgazer_mcp;
--> statement-breakpoint
CREATE VIEW "github"."slack_workspaces" WITH (security_barrier = true) AS (SELECT team_id, team_name, bot_user_id, CASE WHEN installed_by IN (SELECT user_id FROM github."user-assignments" WHERE integration_id = ANY ((SELECT github.integration_ids('viewer'))::uuid[])) THEN installed_by END AS installed_by, installed_at, disconnected_at FROM gitgazer.slack_workspaces WHERE team_id IN (SELECT team_id FROM gitgazer.integration_app_slack_settings WHERE integration_id = ANY ((SELECT github.integration_ids('viewer'))::uuid[])));
--> statement-breakpoint
GRANT SELECT ON github.slack_workspaces TO gitgazer_mcp;
--> statement-breakpoint
CREATE VIEW "github"."user_assignments" WITH (security_barrier = true) AS (SELECT integration_id, user_id, role, source, created_at FROM github."user-assignments" WHERE integration_id = ANY ((SELECT github.integration_ids('viewer'))::uuid[]));
--> statement-breakpoint
GRANT SELECT ON github.user_assignments TO gitgazer_mcp;
--> statement-breakpoint
CREATE VIEW "github"."users" WITH (security_barrier = true) AS (SELECT id, CASE WHEN id IN (SELECT user_id FROM github."user-assignments" WHERE integration_id = ANY ((SELECT github.integration_ids('admin'))::uuid[])) THEN email END AS email, name, picture, github_login, last_active_at FROM gitgazer.users WHERE id IN (SELECT user_id FROM github."user-assignments" WHERE integration_id = ANY ((SELECT github.integration_ids('viewer'))::uuid[])));
--> statement-breakpoint
GRANT SELECT ON github.users TO gitgazer_mcp;
--> statement-breakpoint
CREATE VIEW "github"."webhook_handle_details" WITH (security_barrier = true) AS (SELECT integration_id, handle_id, CASE WHEN integration_id = ANY ((SELECT github.integration_ids('admin'))::uuid[]) THEN url END AS url FROM gitgazer.webhook_handle_details WHERE integration_id = ANY ((SELECT github.integration_ids('viewer'))::uuid[]));
--> statement-breakpoint
GRANT SELECT ON github.webhook_handle_details TO gitgazer_mcp;
--> statement-breakpoint
REVOKE ALL ON github.event_log_entries, github.integration_app_github_settings, github.integration_app_slack_settings, github.integration_apps, github.integration_invitations, github.notification_handles, github.notification_rule_destinations, github.notification_rules, github.slack_handle_details, github.slack_workspaces, github.user_assignments, github.users, github.webhook_handle_details FROM gitgazer_reader, gitgazer_writer;
