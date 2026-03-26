CREATE TABLE "gitgazer"."event_log_entries" (
	"integration_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"category" varchar(30) NOT NULL,
	"type" varchar(20) NOT NULL,
	"title" varchar(500) NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_log_entries_integration_id_id_pk" PRIMARY KEY("integration_id","id")
);
--> statement-breakpoint
ALTER TABLE "gitgazer"."event_log_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gitgazer"."event_log_entries" ADD CONSTRAINT "event_log_entries_integration_id_integrations_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "github"."integrations"("integration_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_log_entries_created_at_idx" ON "gitgazer"."event_log_entries" USING btree ("integration_id","created_at");--> statement-breakpoint
CREATE INDEX "event_log_entries_category_idx" ON "gitgazer"."event_log_entries" USING btree ("integration_id","category");--> statement-breakpoint
CREATE POLICY "tenant separation writer" ON "gitgazer"."event_log_entries" AS PERMISSIVE FOR ALL TO "gitgazer_writer" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation reader" ON "gitgazer"."event_log_entries" AS PERMISSIVE FOR SELECT TO "gitgazer_reader" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));