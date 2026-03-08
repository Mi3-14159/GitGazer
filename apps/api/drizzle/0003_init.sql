CREATE TABLE "gitgazer"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"nickname" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github"."enterprises" (
	"integration_id" uuid,
	"id" bigint,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "enterprises_integration_id_id_pk" PRIMARY KEY("integration_id","id")
);
--> statement-breakpoint
ALTER TABLE "github"."enterprises" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github"."events" (
	"integration_id" uuid,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event" jsonb NOT NULL,
	CONSTRAINT "events_integration_id_id_pk" PRIMARY KEY("integration_id","id")
);
--> statement-breakpoint
ALTER TABLE "github"."events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github"."integrations" (
	"integration_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" varchar(255) NOT NULL,
	"secret" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github"."integrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github"."organizations" (
	"integration_id" uuid,
	"id" bigint,
	"enterprise_id" bigint,
	"login" varchar(255) NOT NULL,
	"description" text,
	CONSTRAINT "organizations_integration_id_id_pk" PRIMARY KEY("integration_id","id")
);
--> statement-breakpoint
ALTER TABLE "github"."organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github"."repositories" (
	"integration_id" uuid,
	"organization_id" bigint,
	"id" bigint,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"name" varchar(255) NOT NULL,
	"private" boolean NOT NULL,
	CONSTRAINT "repositories_integration_id_id_pk" PRIMARY KEY("integration_id","id")
);
--> statement-breakpoint
ALTER TABLE "github"."repositories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github"."user" (
	"integration_id" uuid,
	"id" bigint,
	"login" varchar(255) NOT NULL,
	"type" varchar(255) NOT NULL,
	CONSTRAINT "user_integration_id_id_pk" PRIMARY KEY("integration_id","id")
);
--> statement-breakpoint
ALTER TABLE "github"."user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github"."user-assignments" (
	"integration_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user-assignments_user_id_integration_id_pk" PRIMARY KEY("user_id","integration_id")
);
--> statement-breakpoint
ALTER TABLE "github"."user-assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github"."workflow_jobs" (
	"integration_id" uuid NOT NULL,
	"repository_id" bigint NOT NULL,
	"id" bigint NOT NULL,
	"completed_at" timestamp with time zone,
	"conclusion" varchar(50),
	"created_at" timestamp with time zone NOT NULL,
	"head_branch" text NOT NULL,
	"name" text NOT NULL,
	"runner_group_name" text,
	"run_attempt" integer NOT NULL,
	"run_id" bigint NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"status" varchar(50) NOT NULL,
	"workflow_name" text NOT NULL,
	"workflow_run_id" bigint NOT NULL,
	CONSTRAINT "workflow_jobs_integration_id_id_pk" PRIMARY KEY("integration_id","id")
);
--> statement-breakpoint
ALTER TABLE "github"."workflow_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github"."workflow_runs" (
	"integration_id" uuid NOT NULL,
	"repository_id" bigint NOT NULL,
	"id" bigint NOT NULL,
	"actor_id" bigint NOT NULL,
	"conclusion" varchar,
	"created_at" timestamp with time zone NOT NULL,
	"head_branch" varchar(255) NOT NULL,
	"name" text NOT NULL,
	"run_attempt" integer NOT NULL,
	"status" varchar(50) NOT NULL,
	"run_started_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"workflow_id" bigint NOT NULL,
	"head_commit_author_name" varchar(255) NOT NULL,
	"head_commit_message" text NOT NULL,
	CONSTRAINT "workflow_runs_integration_id_id_pk" PRIMARY KEY("integration_id","id")
);
--> statement-breakpoint
ALTER TABLE "github"."workflow_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "github"."enterprises" ADD CONSTRAINT "enterprises_integration_id_integrations_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "github"."integrations"("integration_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."events" ADD CONSTRAINT "events_integration_id_integrations_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "github"."integrations"("integration_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."organizations" ADD CONSTRAINT "organizations_integration_id_integrations_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "github"."integrations"("integration_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."organizations" ADD CONSTRAINT "organizations_integration_id_enterprise_id_enterprises_integration_id_id_fk" FOREIGN KEY ("integration_id","enterprise_id") REFERENCES "github"."enterprises"("integration_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."repositories" ADD CONSTRAINT "repositories_integration_id_integrations_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "github"."integrations"("integration_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."repositories" ADD CONSTRAINT "repositories_integration_id_organization_id_organizations_integration_id_id_fk" FOREIGN KEY ("integration_id","organization_id") REFERENCES "github"."organizations"("integration_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."user" ADD CONSTRAINT "user_integration_id_integrations_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "github"."integrations"("integration_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."user-assignments" ADD CONSTRAINT "user-assignments_integration_id_integrations_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "github"."integrations"("integration_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."user-assignments" ADD CONSTRAINT "user-assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "gitgazer"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."workflow_jobs" ADD CONSTRAINT "workflow_jobs_integration_id_integrations_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "github"."integrations"("integration_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."workflow_jobs" ADD CONSTRAINT "workflow_jobs_integration_id_repository_id_repositories_integration_id_id_fk" FOREIGN KEY ("integration_id","repository_id") REFERENCES "github"."repositories"("integration_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."workflow_jobs" ADD CONSTRAINT "workflow_jobs_integration_id_workflow_run_id_workflow_runs_integration_id_id_fk" FOREIGN KEY ("integration_id","workflow_run_id") REFERENCES "github"."workflow_runs"("integration_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."workflow_runs" ADD CONSTRAINT "workflow_runs_integration_id_integrations_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "github"."integrations"("integration_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."workflow_runs" ADD CONSTRAINT "workflow_runs_integration_id_repository_id_repositories_integration_id_id_fk" FOREIGN KEY ("integration_id","repository_id") REFERENCES "github"."repositories"("integration_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github"."workflow_runs" ADD CONSTRAINT "workflow_runs_integration_id_actor_id_user_integration_id_id_fk" FOREIGN KEY ("integration_id","actor_id") REFERENCES "github"."user"("integration_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant separation" ON "github"."enterprises" AS PERMISSIVE FOR ALL TO "gitgazer_user" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation" ON "github"."events" AS PERMISSIVE FOR ALL TO "gitgazer_user" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation" ON "github"."integrations" AS PERMISSIVE FOR ALL TO "gitgazer_user" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation" ON "github"."organizations" AS PERMISSIVE FOR ALL TO "gitgazer_user" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation" ON "github"."repositories" AS PERMISSIVE FOR ALL TO "gitgazer_user" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation" ON "github"."user" AS PERMISSIVE FOR ALL TO "gitgazer_user" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation" ON "github"."user-assignments" AS PERMISSIVE FOR ALL TO "gitgazer_user" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation" ON "github"."workflow_jobs" AS PERMISSIVE FOR ALL TO "gitgazer_user" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));--> statement-breakpoint
CREATE POLICY "tenant separation" ON "github"."workflow_runs" AS PERMISSIVE FOR ALL TO "gitgazer_user" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));