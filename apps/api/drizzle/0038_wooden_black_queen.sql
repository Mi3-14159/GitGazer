CREATE TABLE "github"."github_org_members" (
	"installation_id" bigint NOT NULL,
	"github_user_id" bigint NOT NULL,
	"github_login" varchar(255) NOT NULL,
	"role" varchar(20) NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_org_members_installation_id_github_user_id_pk" PRIMARY KEY("installation_id","github_user_id")
);
--> statement-breakpoint
ALTER TABLE "github"."github_org_members" ADD CONSTRAINT "github_org_members_installation_id_github_app_installations_installation_id_fk" FOREIGN KEY ("installation_id") REFERENCES "github"."github_app_installations"("installation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
GRANT SELECT,
	INSERT,
	UPDATE,
	DELETE ON TABLE github.github_org_members TO gitgazer_writer;