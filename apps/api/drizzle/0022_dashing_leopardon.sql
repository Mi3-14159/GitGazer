CREATE TABLE "github"."workflow_run_pull_requests" (
	"integration_id" uuid NOT NULL,
	"workflow_run_id" bigint NOT NULL,
	"pull_request_id" bigint NOT NULL,
	CONSTRAINT "workflow_run_pull_requests_integration_id_workflow_run_id_pull_request_id_pk" PRIMARY KEY("integration_id","workflow_run_id","pull_request_id")
);
--> statement-breakpoint
ALTER TABLE "github"."workflow_run_pull_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "github"."workflow_run_pull_requests" ADD CONSTRAINT "workflow_run_pull_requests_integration_id_integrations_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "github"."integrations"("integration_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."workflow_run_pull_requests" ADD CONSTRAINT "workflow_run_pull_requests_integration_id_workflow_run_id_workflow_runs_integration_id_id_fk" FOREIGN KEY ("integration_id","workflow_run_id") REFERENCES "github"."workflow_runs"("integration_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."workflow_run_pull_requests" ADD CONSTRAINT "workflow_run_pull_requests_integration_id_pull_request_id_pull_requests_integration_id_id_fk" FOREIGN KEY ("integration_id","pull_request_id") REFERENCES "github"."pull_requests"("integration_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant separation" ON "github"."workflow_run_pull_requests" AS PERMISSIVE FOR ALL TO "gitgazer_user" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));