ALTER TABLE "github"."workflow_runs" ALTER COLUMN "run_started_at" SET DATA TYPE timestamp;--> statement-breakpoint
ALTER TABLE "github"."enterprises" DROP COLUMN "created_at";