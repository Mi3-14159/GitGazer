ALTER TABLE "gitgazer"."users" ADD COLUMN "github_id" bigint;--> statement-breakpoint
ALTER TABLE "gitgazer"."users" ADD COLUMN "github_login" varchar(255);--> statement-breakpoint
ALTER TABLE "gitgazer"."users" ADD CONSTRAINT "users_github_id_unique" UNIQUE("github_id");