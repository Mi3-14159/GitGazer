ALTER TABLE "github"."pull_requests" DROP CONSTRAINT "pull_requests_integration_id_repository_id_repositories_integration_id_id_fk";
--> statement-breakpoint
ALTER TABLE "github"."workflow_jobs" DROP CONSTRAINT "workflow_jobs_integration_id_repository_id_repositories_integration_id_id_fk";
--> statement-breakpoint
ALTER TABLE "github"."workflow_runs" DROP CONSTRAINT "workflow_runs_integration_id_repository_id_repositories_integration_id_id_fk";
--> statement-breakpoint
ALTER TABLE "github"."pull_requests" ADD CONSTRAINT "pull_requests_integration_id_repository_id_repositories_integration_id_id_fk" FOREIGN KEY ("integration_id","repository_id") REFERENCES "github"."repositories"("integration_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."workflow_jobs" ADD CONSTRAINT "workflow_jobs_integration_id_repository_id_repositories_integration_id_id_fk" FOREIGN KEY ("integration_id","repository_id") REFERENCES "github"."repositories"("integration_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."workflow_runs" ADD CONSTRAINT "workflow_runs_integration_id_repository_id_repositories_integration_id_id_fk" FOREIGN KEY ("integration_id","repository_id") REFERENCES "github"."repositories"("integration_id","id") ON DELETE cascade ON UPDATE no action;