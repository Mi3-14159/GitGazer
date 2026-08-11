CREATE TABLE "github"."github_app_installations" (
	"installation_id" bigint PRIMARY KEY NOT NULL,
	"integration_id" uuid,
	"account_type" varchar(50) NOT NULL,
	"account_login" varchar(255) NOT NULL,
	"account_id" bigint NOT NULL,
	"repository_selection" varchar(50) NOT NULL,
	"sender_id" bigint NOT NULL,
	"webhook_events" jsonb DEFAULT '["workflow_run","workflow_job"]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github"."github_app_installations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github"."github_app_webhooks" (
	"integration_id" uuid NOT NULL,
	"installation_id" bigint NOT NULL,
	"webhook_id" bigint NOT NULL,
	"target_type" varchar(50) NOT NULL,
	"target_id" bigint NOT NULL,
	"target_name" varchar(255) NOT NULL,
	"events" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_app_webhooks_integration_id_webhook_id_pk" PRIMARY KEY("integration_id","webhook_id")
);
--> statement-breakpoint
ALTER TABLE "github"."github_app_webhooks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "github"."github_app_installations" ADD CONSTRAINT "github_app_installations_integration_id_integrations_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "github"."integrations"("integration_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."github_app_webhooks" ADD CONSTRAINT "github_app_webhooks_integration_id_integrations_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "github"."integrations"("integration_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."github_app_webhooks" ADD CONSTRAINT "github_app_webhooks_installation_id_github_app_installations_installation_id_fk" FOREIGN KEY ("installation_id") REFERENCES "github"."github_app_installations"("installation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "github_app_installations_integration_id_idx" ON "github"."github_app_installations" USING btree ("integration_id");--> statement-breakpoint
DROP POLICY "tenant separation analyst" ON "gitgazer"."notification_rules" CASCADE;--> statement-breakpoint
DROP POLICY "tenant separation analyst" ON "gitgazer"."ws_connections" CASCADE;--> statement-breakpoint
DROP POLICY "tenant separation analyst" ON "github"."events" CASCADE;--> statement-breakpoint
DROP POLICY "tenant separation analyst" ON "github"."integrations" CASCADE;--> statement-breakpoint
DROP POLICY "tenant separation analyst" ON "github"."user-assignments" CASCADE;--> statement-breakpoint
CREATE POLICY "tenant separation writer" ON "github"."github_app_installations" AS PERMISSIVE FOR ALL TO "gitgazer_writer" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation reader" ON "github"."github_app_installations" AS PERMISSIVE FOR SELECT TO "gitgazer_reader" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation writer" ON "github"."github_app_webhooks" AS PERMISSIVE FOR ALL TO "gitgazer_writer" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation reader" ON "github"."github_app_webhooks" AS PERMISSIVE FOR SELECT TO "gitgazer_reader" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
-- Grant permissions on new tables
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE github.github_app_installations TO gitgazer_writer;--> statement-breakpoint
GRANT SELECT ON TABLE github.github_app_installations TO gitgazer_reader;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE github.github_app_webhooks TO gitgazer_writer;--> statement-breakpoint
GRANT SELECT ON TABLE github.github_app_webhooks TO gitgazer_reader;