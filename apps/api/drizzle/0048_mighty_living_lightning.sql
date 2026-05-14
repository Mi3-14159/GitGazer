CREATE INDEX "pull_requests_merged_at" ON "github"."pull_requests" USING btree ("integration_id","merged_at");--> statement-breakpoint
CREATE INDEX "pull_requests_closed_at" ON "github"."pull_requests" USING btree ("integration_id","closed_at");--> statement-breakpoint
CREATE INDEX "pull_requests_created_at" ON "github"."pull_requests" USING btree ("integration_id","created_at");--> statement-breakpoint
CREATE INDEX "repositories_topics_gin" ON "github"."repositories" USING gin ("topics");--> statement-breakpoint
CREATE INDEX "workflow_jobs_created_at" ON "github"."workflow_jobs" USING btree ("integration_id","created_at");--> statement-breakpoint
CREATE INDEX "workflow_runs_recovery_lookup" ON "github"."workflow_runs" USING btree ("integration_id","workflow_id","head_branch","conclusion","created_at");