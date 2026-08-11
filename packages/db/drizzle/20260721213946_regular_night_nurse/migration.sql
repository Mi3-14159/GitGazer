DROP POLICY "tenant separation analyst" ON "github"."enterprises" CASCADE;--> statement-breakpoint
DROP POLICY "tenant separation analyst" ON "github"."organizations" CASCADE;--> statement-breakpoint
DROP POLICY "tenant separation analyst" ON "github"."pull_request_reviews" CASCADE;--> statement-breakpoint
DROP POLICY "tenant separation analyst" ON "github"."pull_requests" CASCADE;--> statement-breakpoint
DROP POLICY "tenant separation analyst" ON "github"."repositories" CASCADE;--> statement-breakpoint
DROP POLICY "tenant separation analyst" ON "github"."user" CASCADE;--> statement-breakpoint
DROP POLICY "tenant separation analyst" ON "github"."workflow_jobs" CASCADE;--> statement-breakpoint
DROP POLICY "tenant separation analyst" ON "github"."workflow_run_pull_requests" CASCADE;--> statement-breakpoint
DROP POLICY "tenant separation analyst" ON "github"."workflow_runs" CASCADE;--> statement-breakpoint
-- Revoke every privilege granted to the role (the GRANTs + ALTER DEFAULT PRIVILEGES from 0026),
-- run as the grantor (root), which is not a member of gitgazer_analyst so DROP OWNED BY is denied.
-- Without this, DROP ROLE fails with 2BP01 "role cannot be dropped because some objects depend on it".
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA "github" FROM "gitgazer_analyst";--> statement-breakpoint
REVOKE ALL PRIVILEGES ON SCHEMA "github" FROM "gitgazer_analyst";--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "github" REVOKE ALL ON TABLES FROM "gitgazer_analyst";--> statement-breakpoint
DROP ROLE "gitgazer_analyst";