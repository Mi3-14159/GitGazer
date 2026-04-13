CREATE TABLE "github"."pending_org_sync" (
	"integration_id" uuid NOT NULL,
	"github_user_id" bigint NOT NULL,
	"github_login" varchar(255) NOT NULL,
	"role" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pending_org_sync_integration_id_github_user_id_pk" PRIMARY KEY("integration_id","github_user_id")
);
--> statement-breakpoint
ALTER TABLE "github"."pending_org_sync" ADD CONSTRAINT "pending_org_sync_integration_id_integrations_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "github"."integrations"("integration_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE github.pending_org_sync TO gitgazer_writer;