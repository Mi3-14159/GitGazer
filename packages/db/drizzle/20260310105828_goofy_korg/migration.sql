ALTER TABLE "github"."enterprises" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "github"."organizations" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "github"."repositories" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "github"."user" ALTER COLUMN "id" SET NOT NULL;