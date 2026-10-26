CREATE TABLE "gitgazer"."integration_app_slack_settings" (
	"integration_id" uuid,
	"app_id" uuid,
	"team_id" varchar(32) NOT NULL,
	CONSTRAINT "integration_app_slack_settings_pkey" PRIMARY KEY("integration_id","app_id")
);
--> statement-breakpoint
ALTER TABLE "gitgazer"."integration_app_slack_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "gitgazer"."slack_handle_details" (
	"integration_id" uuid,
	"handle_id" uuid,
	"channel_id" varchar(32) NOT NULL,
	"channel_name" varchar(255) NOT NULL,
	CONSTRAINT "slack_handle_details_pkey" PRIMARY KEY("integration_id","handle_id")
);
--> statement-breakpoint
ALTER TABLE "gitgazer"."slack_handle_details" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "gitgazer"."slack_user_links" (
	"team_id" varchar(32),
	"github_user_id" bigint,
	"slack_user_id" varchar(32),
	"source" varchar(30),
	"checked_at" timestamp with time zone NOT NULL,
	"auto_link_blocked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "slack_user_links_pkey" PRIMARY KEY("team_id","github_user_id")
);
--> statement-breakpoint
CREATE TABLE "gitgazer"."slack_workspaces" (
	"team_id" varchar(32) PRIMARY KEY,
	"team_name" varchar(255) NOT NULL,
	"bot_user_id" varchar(32) NOT NULL,
	"bot_token_ciphertext" text NOT NULL,
	"installed_by" bigint,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disconnected_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "integration_app_slack_settings_team_idx" ON "gitgazer"."integration_app_slack_settings" ("team_id");--> statement-breakpoint
ALTER TABLE "gitgazer"."integration_app_slack_settings" ADD CONSTRAINT "integration_app_slack_settings_xU76PfzrUK9N_fkey" FOREIGN KEY ("integration_id") REFERENCES "github"."integrations"("integration_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gitgazer"."integration_app_slack_settings" ADD CONSTRAINT "integration_app_slack_settings_IXhIMCnHcs1X_fkey" FOREIGN KEY ("team_id") REFERENCES "gitgazer"."slack_workspaces"("team_id");--> statement-breakpoint
ALTER TABLE "gitgazer"."integration_app_slack_settings" ADD CONSTRAINT "integration_app_slack_settings_SvrUtMxSIn9R_fkey" FOREIGN KEY ("integration_id","app_id") REFERENCES "gitgazer"."integration_apps"("integration_id","app_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gitgazer"."slack_handle_details" ADD CONSTRAINT "slack_handle_details_2gs7jfH0PcKo_fkey" FOREIGN KEY ("integration_id") REFERENCES "github"."integrations"("integration_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gitgazer"."slack_handle_details" ADD CONSTRAINT "slack_handle_details_Lo3hx8uv2tIg_fkey" FOREIGN KEY ("integration_id","handle_id") REFERENCES "gitgazer"."notification_handles"("integration_id","handle_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gitgazer"."slack_user_links" ADD CONSTRAINT "slack_user_links_team_id_slack_workspaces_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "gitgazer"."slack_workspaces"("team_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gitgazer"."slack_workspaces" ADD CONSTRAINT "slack_workspaces_installed_by_users_id_fkey" FOREIGN KEY ("installed_by") REFERENCES "gitgazer"."users"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE POLICY "tenant separation writer" ON "gitgazer"."integration_app_slack_settings" AS PERMISSIVE FOR ALL TO "gitgazer_writer" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation reader" ON "gitgazer"."integration_app_slack_settings" AS PERMISSIVE FOR SELECT TO "gitgazer_reader" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation writer" ON "gitgazer"."slack_handle_details" AS PERMISSIVE FOR ALL TO "gitgazer_writer" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation reader" ON "gitgazer"."slack_handle_details" AS PERMISSIVE FOR SELECT TO "gitgazer_reader" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));