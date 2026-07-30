CREATE TABLE "gitgazer"."notification_rules" (
	"integration_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"channels" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"ignore_dependabot" boolean DEFAULT false NOT NULL,
	"rule" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_rules_integration_id_id_pk" PRIMARY KEY("integration_id","id")
);
--> statement-breakpoint
ALTER TABLE "gitgazer"."notification_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gitgazer"."notification_rules" ADD CONSTRAINT "notification_rules_integration_id_integrations_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "github"."integrations"("integration_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant separation" ON "gitgazer"."notification_rules" AS PERMISSIVE FOR ALL TO "gitgazer_user" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));