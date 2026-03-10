CREATE TABLE "github"."pull_requests" (
	"integration_id" uuid NOT NULL,
	"repository_id" bigint NOT NULL,
	"id" bigint NOT NULL,
	"number" integer NOT NULL,
	"state" varchar(50) NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"head_branch" varchar(255) NOT NULL,
	"base_branch" varchar(255) NOT NULL,
	"author_id" bigint NOT NULL,
	"draft" boolean NOT NULL,
	"merged" boolean,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"merged_at" timestamp with time zone,
	CONSTRAINT "pull_requests_integration_id_id_pk" PRIMARY KEY("integration_id","id")
);
--> statement-breakpoint
ALTER TABLE "github"."pull_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github"."workflow_run_pull_requests" (
	"integration_id" uuid NOT NULL,
	"workflow_run_id" bigint NOT NULL,
	"pull_request_id" bigint NOT NULL,
	CONSTRAINT "workflow_run_pull_requests_integration_id_workflow_run_id_pull_request_id_pk" PRIMARY KEY("integration_id","workflow_run_id","pull_request_id")
);
--> statement-breakpoint
ALTER TABLE "github"."workflow_run_pull_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "github"."pull_requests" ADD CONSTRAINT "pull_requests_integration_id_integrations_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "github"."integrations"("integration_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."pull_requests" ADD CONSTRAINT "pull_requests_integration_id_repository_id_repositories_integration_id_id_fk" FOREIGN KEY ("integration_id","repository_id") REFERENCES "github"."repositories"("integration_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."pull_requests" ADD CONSTRAINT "pull_requests_integration_id_author_id_user_integration_id_id_fk" FOREIGN KEY ("integration_id","author_id") REFERENCES "github"."user"("integration_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."workflow_run_pull_requests" ADD CONSTRAINT "workflow_run_pull_requests_integration_id_integrations_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "github"."integrations"("integration_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."workflow_run_pull_requests" ADD CONSTRAINT "workflow_run_pull_requests_integration_id_workflow_run_id_workflow_runs_integration_id_id_fk" FOREIGN KEY ("integration_id","workflow_run_id") REFERENCES "github"."workflow_runs"("integration_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."workflow_run_pull_requests" ADD CONSTRAINT "workflow_run_pull_requests_integration_id_pull_request_id_pull_requests_integration_id_id_fk" FOREIGN KEY ("integration_id","pull_request_id") REFERENCES "github"."pull_requests"("integration_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant separation" ON "github"."pull_requests" AS PERMISSIVE FOR ALL TO "gitgazer_user" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation" ON "github"."workflow_run_pull_requests" AS PERMISSIVE FOR ALL TO "gitgazer_user" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));