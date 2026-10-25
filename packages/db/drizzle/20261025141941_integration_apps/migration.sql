CREATE TABLE "gitgazer"."integration_app_github_settings" (
	"integration_id" uuid,
	"app_id" uuid,
	"secret" uuid DEFAULT gen_random_uuid() NOT NULL,
	"org_sync_default_role" varchar(20) DEFAULT 'viewer' NOT NULL,
	CONSTRAINT "integration_app_github_settings_pkey" PRIMARY KEY("integration_id","app_id")
);
--> statement-breakpoint
ALTER TABLE "gitgazer"."integration_app_github_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "gitgazer"."integration_apps" (
	"integration_id" uuid,
	"app_id" uuid DEFAULT gen_random_uuid(),
	"type" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_apps_pkey" PRIMARY KEY("integration_id","app_id"),
	CONSTRAINT "integration_apps_integration_id_type_unique" UNIQUE("integration_id","type")
);
--> statement-breakpoint
ALTER TABLE "gitgazer"."integration_apps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "gitgazer"."notification_handles" (
	"integration_id" uuid,
	"handle_id" uuid DEFAULT gen_random_uuid(),
	"app_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_handles_pkey" PRIMARY KEY("integration_id","handle_id")
);
--> statement-breakpoint
ALTER TABLE "gitgazer"."notification_handles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "gitgazer"."notification_rule_destinations" (
	"integration_id" uuid,
	"rule_id" uuid,
	"handle_id" uuid,
	CONSTRAINT "notification_rule_destinations_pkey" PRIMARY KEY("integration_id","rule_id","handle_id")
);
--> statement-breakpoint
ALTER TABLE "gitgazer"."notification_rule_destinations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "gitgazer"."webhook_handle_details" (
	"integration_id" uuid,
	"handle_id" uuid,
	"url" text NOT NULL,
	CONSTRAINT "webhook_handle_details_pkey" PRIMARY KEY("integration_id","handle_id")
);
--> statement-breakpoint
ALTER TABLE "gitgazer"."webhook_handle_details" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "notification_handles_integration_app_idx" ON "gitgazer"."notification_handles" ("integration_id","app_id");--> statement-breakpoint
CREATE INDEX "notification_rule_destinations_integration_handle_idx" ON "gitgazer"."notification_rule_destinations" ("integration_id","handle_id");--> statement-breakpoint
ALTER TABLE "gitgazer"."integration_app_github_settings" ADD CONSTRAINT "integration_app_github_settings_HFo79boKHKyU_fkey" FOREIGN KEY ("integration_id") REFERENCES "github"."integrations"("integration_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gitgazer"."integration_app_github_settings" ADD CONSTRAINT "integration_app_github_settings_jAayNn3F85Ck_fkey" FOREIGN KEY ("integration_id","app_id") REFERENCES "gitgazer"."integration_apps"("integration_id","app_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gitgazer"."integration_apps" ADD CONSTRAINT "integration_apps_Yz9YAXUu8qQl_fkey" FOREIGN KEY ("integration_id") REFERENCES "github"."integrations"("integration_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gitgazer"."notification_handles" ADD CONSTRAINT "notification_handles_70aW6WtatXh9_fkey" FOREIGN KEY ("integration_id") REFERENCES "github"."integrations"("integration_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gitgazer"."notification_handles" ADD CONSTRAINT "notification_handles_AxFp9oGUt3UL_fkey" FOREIGN KEY ("integration_id","app_id") REFERENCES "gitgazer"."integration_apps"("integration_id","app_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gitgazer"."notification_rule_destinations" ADD CONSTRAINT "notification_rule_destinations_1YI3GjneY82M_fkey" FOREIGN KEY ("integration_id") REFERENCES "github"."integrations"("integration_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gitgazer"."notification_rule_destinations" ADD CONSTRAINT "notification_rule_destinations_azDHiOLXy8Tj_fkey" FOREIGN KEY ("integration_id","rule_id") REFERENCES "gitgazer"."notification_rules"("integration_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gitgazer"."notification_rule_destinations" ADD CONSTRAINT "notification_rule_destinations_WENZbdyHheO8_fkey" FOREIGN KEY ("integration_id","handle_id") REFERENCES "gitgazer"."notification_handles"("integration_id","handle_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gitgazer"."webhook_handle_details" ADD CONSTRAINT "webhook_handle_details_DrVdi1S0ZSb7_fkey" FOREIGN KEY ("integration_id") REFERENCES "github"."integrations"("integration_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gitgazer"."webhook_handle_details" ADD CONSTRAINT "webhook_handle_details_YKJqjJXUnwIF_fkey" FOREIGN KEY ("integration_id","handle_id") REFERENCES "gitgazer"."notification_handles"("integration_id","handle_id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "tenant separation writer" ON "gitgazer"."integration_app_github_settings" AS PERMISSIVE FOR ALL TO "gitgazer_writer" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation reader" ON "gitgazer"."integration_app_github_settings" AS PERMISSIVE FOR SELECT TO "gitgazer_reader" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation writer" ON "gitgazer"."integration_apps" AS PERMISSIVE FOR ALL TO "gitgazer_writer" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation reader" ON "gitgazer"."integration_apps" AS PERMISSIVE FOR SELECT TO "gitgazer_reader" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation writer" ON "gitgazer"."notification_handles" AS PERMISSIVE FOR ALL TO "gitgazer_writer" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation reader" ON "gitgazer"."notification_handles" AS PERMISSIVE FOR SELECT TO "gitgazer_reader" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation writer" ON "gitgazer"."notification_rule_destinations" AS PERMISSIVE FOR ALL TO "gitgazer_writer" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation reader" ON "gitgazer"."notification_rule_destinations" AS PERMISSIVE FOR SELECT TO "gitgazer_reader" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation writer" ON "gitgazer"."webhook_handle_details" AS PERMISSIVE FOR ALL TO "gitgazer_writer" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation reader" ON "gitgazer"."webhook_handle_details" AS PERMISSIVE FOR SELECT TO "gitgazer_reader" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));