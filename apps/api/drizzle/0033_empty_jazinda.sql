CREATE TABLE "github"."pull_request_reviews" (
	"integration_id" uuid NOT NULL,
	"id" bigint NOT NULL,
	"pull_request_id" bigint NOT NULL,
	"repository_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"state" varchar(50) NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"body" text,
	CONSTRAINT "pull_request_reviews_integration_id_id_pk" PRIMARY KEY("integration_id","id")
);
--> statement-breakpoint
ALTER TABLE "github"."pull_request_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "github"."pull_request_reviews" ADD CONSTRAINT "pull_request_reviews_integration_id_integrations_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "github"."integrations"("integration_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."pull_request_reviews" ADD CONSTRAINT "pull_request_reviews_integration_id_pull_request_id_pull_requests_integration_id_id_fk" FOREIGN KEY ("integration_id","pull_request_id") REFERENCES "github"."pull_requests"("integration_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."pull_request_reviews" ADD CONSTRAINT "pull_request_reviews_integration_id_repository_id_repositories_integration_id_id_fk" FOREIGN KEY ("integration_id","repository_id") REFERENCES "github"."repositories"("integration_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."pull_request_reviews" ADD CONSTRAINT "pull_request_reviews_integration_id_user_id_user_integration_id_id_fk" FOREIGN KEY ("integration_id","user_id") REFERENCES "github"."user"("integration_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pull_request_reviews_pr_lookup" ON "github"."pull_request_reviews" USING btree ("integration_id","pull_request_id","submitted_at");--> statement-breakpoint
CREATE INDEX "pull_request_reviews_repo_submitted" ON "github"."pull_request_reviews" USING btree ("integration_id","repository_id","submitted_at");--> statement-breakpoint
CREATE POLICY "tenant separation writer" ON "github"."pull_request_reviews" AS PERMISSIVE FOR ALL TO "gitgazer_writer" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation reader" ON "github"."pull_request_reviews" AS PERMISSIVE FOR SELECT TO "gitgazer_reader" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation analyst" ON "github"."pull_request_reviews" AS PERMISSIVE FOR SELECT TO "gitgazer_analyst" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
-- Grant permissions on new table
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE github.pull_request_reviews TO gitgazer_writer;--> statement-breakpoint
GRANT SELECT ON TABLE github.pull_request_reviews TO gitgazer_reader;--> statement-breakpoint
GRANT SELECT ON TABLE github.pull_request_reviews TO gitgazer_analyst;