CREATE TABLE "gitgazer"."integration_invitations" (
	"integration_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255),
	"role" varchar(20) DEFAULT 'member' NOT NULL,
	"invited_by" bigint NOT NULL,
	"invitee_id" bigint,
	"invite_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "integration_invitations_integration_id_id_pk" PRIMARY KEY("integration_id","id"),
	CONSTRAINT "integration_invitations_invite_token_unique" UNIQUE("invite_token")
);
--> statement-breakpoint
ALTER TABLE "gitgazer"."integration_invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "github"."workflow_jobs" ALTER COLUMN "head_branch" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "gitgazer"."notification_rules" ADD COLUMN "label" varchar(100) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gitgazer"."users" ADD COLUMN "email" varchar(255);--> statement-breakpoint
ALTER TABLE "gitgazer"."users" ADD COLUMN "name" varchar(255);--> statement-breakpoint
ALTER TABLE "gitgazer"."users" ADD COLUMN "picture" text;--> statement-breakpoint
ALTER TABLE "github"."user-assignments" ADD COLUMN "role" varchar(20) DEFAULT 'viewer' NOT NULL;--> statement-breakpoint
ALTER TABLE "gitgazer"."integration_invitations" ADD CONSTRAINT "integration_invitations_integration_id_integrations_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "github"."integrations"("integration_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gitgazer"."integration_invitations" ADD CONSTRAINT "integration_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "gitgazer"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gitgazer"."integration_invitations" ADD CONSTRAINT "integration_invitations_invitee_id_users_id_fk" FOREIGN KEY ("invitee_id") REFERENCES "gitgazer"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "integration_invitations_email_idx" ON "gitgazer"."integration_invitations" USING btree ("integration_id","email");--> statement-breakpoint
CREATE INDEX "integration_invitations_token_idx" ON "gitgazer"."integration_invitations" USING btree ("invite_token");--> statement-breakpoint
CREATE POLICY "tenant separation writer" ON "gitgazer"."integration_invitations" AS PERMISSIVE FOR ALL TO "gitgazer_writer" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation reader" ON "gitgazer"."integration_invitations" AS PERMISSIVE FOR SELECT TO "gitgazer_reader" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));