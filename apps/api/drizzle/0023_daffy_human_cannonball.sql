ALTER ROLE "gitgazer_user" RENAME TO "gitgazer_writer";--> statement-breakpoint
CREATE ROLE "gitgazer_reader" WITH NOINHERIT;--> statement-breakpoint
ALTER ROLE "gitgazer_writer" WITH NOCREATEDB NOCREATEROLE NOINHERIT;--> statement-breakpoint
ALTER POLICY "tenant separation" ON "gitgazer"."notification_rules" RENAME TO "tenant separation writer";--> statement-breakpoint
ALTER POLICY "tenant separation" ON "gitgazer"."ws_connections" RENAME TO "tenant separation writer";--> statement-breakpoint
ALTER POLICY "tenant separation" ON "github"."enterprises" RENAME TO "tenant separation writer";--> statement-breakpoint
ALTER POLICY "tenant separation" ON "github"."events" RENAME TO "tenant separation writer";--> statement-breakpoint
ALTER POLICY "tenant separation" ON "github"."integrations" RENAME TO "tenant separation writer";--> statement-breakpoint
ALTER POLICY "tenant separation" ON "github"."organizations" RENAME TO "tenant separation writer";--> statement-breakpoint
ALTER POLICY "tenant separation" ON "github"."pull_requests" RENAME TO "tenant separation writer";--> statement-breakpoint
ALTER POLICY "tenant separation" ON "github"."repositories" RENAME TO "tenant separation writer";--> statement-breakpoint
ALTER POLICY "tenant separation" ON "github"."user" RENAME TO "tenant separation writer";--> statement-breakpoint
ALTER POLICY "tenant separation" ON "github"."user-assignments" RENAME TO "tenant separation writer";--> statement-breakpoint
ALTER POLICY "tenant separation" ON "github"."workflow_jobs" RENAME TO "tenant separation writer";--> statement-breakpoint
ALTER POLICY "tenant separation" ON "github"."workflow_run_pull_requests" RENAME TO "tenant separation writer";--> statement-breakpoint
ALTER POLICY "tenant separation" ON "github"."workflow_runs" RENAME TO "tenant separation writer";--> statement-breakpoint
CREATE POLICY "tenant separation reader" ON "gitgazer"."notification_rules" AS PERMISSIVE FOR SELECT TO "gitgazer_reader" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation reader" ON "gitgazer"."ws_connections" AS PERMISSIVE FOR SELECT TO "gitgazer_reader" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation reader" ON "github"."enterprises" AS PERMISSIVE FOR SELECT TO "gitgazer_reader" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation reader" ON "github"."events" AS PERMISSIVE FOR SELECT TO "gitgazer_reader" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation reader" ON "github"."integrations" AS PERMISSIVE FOR SELECT TO "gitgazer_reader" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation reader" ON "github"."organizations" AS PERMISSIVE FOR SELECT TO "gitgazer_reader" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation reader" ON "github"."pull_requests" AS PERMISSIVE FOR SELECT TO "gitgazer_reader" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation reader" ON "github"."repositories" AS PERMISSIVE FOR SELECT TO "gitgazer_reader" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation reader" ON "github"."user" AS PERMISSIVE FOR SELECT TO "gitgazer_reader" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation reader" ON "github"."user-assignments" AS PERMISSIVE FOR SELECT TO "gitgazer_reader" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation reader" ON "github"."workflow_jobs" AS PERMISSIVE FOR SELECT TO "gitgazer_reader" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation reader" ON "github"."workflow_run_pull_requests" AS PERMISSIVE FOR SELECT TO "gitgazer_reader" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation reader" ON "github"."workflow_runs" AS PERMISSIVE FOR SELECT TO "gitgazer_reader" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));