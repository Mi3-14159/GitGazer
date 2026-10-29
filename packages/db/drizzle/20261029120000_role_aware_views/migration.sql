CREATE SCHEMA gitgazer_internal;
--> statement-breakpoint
ALTER TABLE gitgazer.mcp_context_key RENAME TO context_key;
--> statement-breakpoint
ALTER TABLE gitgazer.context_key SET SCHEMA gitgazer_internal;
--> statement-breakpoint
ALTER TABLE gitgazer_internal.context_key RENAME CONSTRAINT mcp_context_key_pkey TO context_key_pkey;
--> statement-breakpoint
ALTER FUNCTION gitgazer.mcp_sign_context(text, integer, bigint) RENAME TO sign_context;
--> statement-breakpoint
ALTER FUNCTION gitgazer.sign_context(text, integer, bigint) SET SCHEMA gitgazer_internal;
--> statement-breakpoint
ALTER FUNCTION github.mcp_context() RENAME TO signed_context;
--> statement-breakpoint
ALTER FUNCTION github.mcp_integration_ids(text) RENAME TO integration_ids;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION gitgazer_internal.sign_context(p_payload text, p_pid integer, p_txn_start_us bigint)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT encode(public.hmac(convert_to(p_payload || '|' || p_pid || '|' || p_txn_start_us, 'UTF8'), key, 'sha256'), 'hex')
    FROM gitgazer_internal.context_key
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
        FROM context, gitgazer_internal.context_key
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
GRANT USAGE ON SCHEMA gitgazer TO gitgazer_mcp;
--> statement-breakpoint
CREATE VIEW "gitgazer"."event_log_entries_view" WITH (security_barrier = true) AS (select "integration_id", "id", "category", "type", "title", "message", "metadata", "read", "created_at" from "gitgazer"."event_log_entries" where "gitgazer"."event_log_entries"."integration_id" = ANY ((SELECT github.integration_ids('viewer'))::uuid[]));
--> statement-breakpoint
GRANT SELECT ON gitgazer.event_log_entries_view TO gitgazer_mcp;
--> statement-breakpoint
CREATE VIEW "gitgazer"."integration_app_github_settings_view" WITH (security_barrier = true) AS (select "integration_id", "app_id", CASE WHEN "gitgazer"."integration_app_github_settings"."integration_id" = ANY ((SELECT github.integration_ids('admin'))::uuid[]) THEN "secret" END as "secret", "org_sync_default_role" from "gitgazer"."integration_app_github_settings" where "gitgazer"."integration_app_github_settings"."integration_id" = ANY ((SELECT github.integration_ids('viewer'))::uuid[]));
--> statement-breakpoint
GRANT SELECT ON gitgazer.integration_app_github_settings_view TO gitgazer_mcp;
--> statement-breakpoint
CREATE VIEW "gitgazer"."integration_app_slack_settings_view" WITH (security_barrier = true) AS (select "integration_id", "app_id", "team_id" from "gitgazer"."integration_app_slack_settings" where "gitgazer"."integration_app_slack_settings"."integration_id" = ANY ((SELECT github.integration_ids('viewer'))::uuid[]));
--> statement-breakpoint
GRANT SELECT ON gitgazer.integration_app_slack_settings_view TO gitgazer_mcp;
--> statement-breakpoint
CREATE VIEW "gitgazer"."integration_apps_view" WITH (security_barrier = true) AS (select "integration_id", "app_id", "type", "created_at" from "gitgazer"."integration_apps" where "gitgazer"."integration_apps"."integration_id" = ANY ((SELECT github.integration_ids('viewer'))::uuid[]));
--> statement-breakpoint
GRANT SELECT ON gitgazer.integration_apps_view TO gitgazer_mcp;
--> statement-breakpoint
CREATE VIEW "gitgazer"."integration_invitations_view" WITH (security_barrier = true) AS (select "integration_id", "id", CASE WHEN "gitgazer"."integration_invitations"."integration_id" = ANY ((SELECT github.integration_ids('admin'))::uuid[]) THEN "email" END as "email", "role", "invited_by", "invitee_id", CASE WHEN "gitgazer"."integration_invitations"."integration_id" = ANY ((SELECT github.integration_ids('admin'))::uuid[]) THEN "invite_token" END as "invite_token", "status", "created_at", "expires_at" from "gitgazer"."integration_invitations" where (("gitgazer"."integration_invitations"."status" <> 'accepted') and ("gitgazer"."integration_invitations"."integration_id" = ANY ((SELECT github.integration_ids('member'))::uuid[]))));
--> statement-breakpoint
GRANT SELECT ON gitgazer.integration_invitations_view TO gitgazer_mcp;
--> statement-breakpoint
CREATE VIEW "gitgazer"."notification_handles_view" WITH (security_barrier = true) AS (select "integration_id", "handle_id", "app_id", "name", "created_at", "updated_at" from "gitgazer"."notification_handles" where "gitgazer"."notification_handles"."integration_id" = ANY ((SELECT github.integration_ids('viewer'))::uuid[]));
--> statement-breakpoint
GRANT SELECT ON gitgazer.notification_handles_view TO gitgazer_mcp;
--> statement-breakpoint
CREATE VIEW "gitgazer"."notification_rule_destinations_view" WITH (security_barrier = true) AS (select "integration_id", "rule_id", "handle_id" from "gitgazer"."notification_rule_destinations" where "gitgazer"."notification_rule_destinations"."integration_id" = ANY ((SELECT github.integration_ids('viewer'))::uuid[]));
--> statement-breakpoint
GRANT SELECT ON gitgazer.notification_rule_destinations_view TO gitgazer_mcp;
--> statement-breakpoint
CREATE VIEW "gitgazer"."notification_rules_view" WITH (security_barrier = true) AS (select "integration_id", "id", "label", "enabled", "ignore_dependabot", "include_log_details", "rule", "created_at", "updated_at" from "gitgazer"."notification_rules" where "gitgazer"."notification_rules"."integration_id" = ANY ((SELECT github.integration_ids('viewer'))::uuid[]));
--> statement-breakpoint
GRANT SELECT ON gitgazer.notification_rules_view TO gitgazer_mcp;
--> statement-breakpoint
CREATE VIEW "gitgazer"."slack_handle_details_view" WITH (security_barrier = true) AS (select "integration_id", "handle_id", "channel_id", "channel_name" from "gitgazer"."slack_handle_details" where "gitgazer"."slack_handle_details"."integration_id" = ANY ((SELECT github.integration_ids('viewer'))::uuid[]));
--> statement-breakpoint
GRANT SELECT ON gitgazer.slack_handle_details_view TO gitgazer_mcp;
--> statement-breakpoint
CREATE VIEW "gitgazer"."slack_workspaces_view" WITH (security_barrier = true) AS (select "team_id", "team_name", "bot_user_id", CASE WHEN "gitgazer"."slack_workspaces"."installed_by" in (select "user_id" from "github"."user-assignments" where "github"."user-assignments"."integration_id" = ANY ((SELECT github.integration_ids('viewer'))::uuid[])) THEN "installed_by" END as "installed_by", "installed_at", "disconnected_at" from "gitgazer"."slack_workspaces" where "gitgazer"."slack_workspaces"."team_id" in (select "team_id" from "gitgazer"."integration_app_slack_settings" where "gitgazer"."integration_app_slack_settings"."integration_id" = ANY ((SELECT github.integration_ids('viewer'))::uuid[])));
--> statement-breakpoint
GRANT SELECT ON gitgazer.slack_workspaces_view TO gitgazer_mcp;
--> statement-breakpoint
CREATE VIEW "github"."user_assignments_view" WITH (security_barrier = true) AS (select "integration_id", "user_id", "role", "source", "created_at" from "github"."user-assignments" where "github"."user-assignments"."integration_id" = ANY ((SELECT github.integration_ids('viewer'))::uuid[]));
--> statement-breakpoint
GRANT SELECT ON github.user_assignments_view TO gitgazer_mcp;
--> statement-breakpoint
CREATE VIEW "gitgazer"."users_view" WITH (security_barrier = true) AS (select "id", CASE WHEN "gitgazer"."users"."id" in (select "user_id" from "github"."user-assignments" where "github"."user-assignments"."integration_id" = ANY ((SELECT github.integration_ids('admin'))::uuid[])) THEN "email" END as "email", "name", "picture", "github_login", "last_active_at" from "gitgazer"."users" where "gitgazer"."users"."id" in (select "user_id" from "github"."user-assignments" where "github"."user-assignments"."integration_id" = ANY ((SELECT github.integration_ids('viewer'))::uuid[])));
--> statement-breakpoint
GRANT SELECT ON gitgazer.users_view TO gitgazer_mcp;
--> statement-breakpoint
CREATE VIEW "gitgazer"."webhook_handle_details_view" WITH (security_barrier = true) AS (select "integration_id", "handle_id", CASE WHEN "gitgazer"."webhook_handle_details"."integration_id" = ANY ((SELECT github.integration_ids('admin'))::uuid[]) THEN "url" END as "url" from "gitgazer"."webhook_handle_details" where "gitgazer"."webhook_handle_details"."integration_id" = ANY ((SELECT github.integration_ids('viewer'))::uuid[]));
--> statement-breakpoint
GRANT SELECT ON gitgazer.webhook_handle_details_view TO gitgazer_mcp;
--> statement-breakpoint
REVOKE ALL ON gitgazer.event_log_entries_view, gitgazer.integration_app_github_settings_view, gitgazer.integration_app_slack_settings_view, gitgazer.integration_apps_view, gitgazer.integration_invitations_view, gitgazer.notification_handles_view, gitgazer.notification_rule_destinations_view, gitgazer.notification_rules_view, gitgazer.slack_handle_details_view, gitgazer.slack_workspaces_view, github.user_assignments_view, gitgazer.users_view, gitgazer.webhook_handle_details_view FROM gitgazer_reader, gitgazer_writer;
