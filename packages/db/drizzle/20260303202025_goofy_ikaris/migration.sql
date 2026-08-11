ALTER TABLE "github"."user-assignments" DROP CONSTRAINT "user-assignments_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "github"."user-assignments" DROP CONSTRAINT "user-assignments_user_id_integration_id_pk";--> statement-breakpoint
ALTER TABLE "github"."user-assignments" DROP COLUMN "user_id";
ALTER TABLE "gitgazer"."users" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "gitgazer"."users" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "gitgazer"."users" DROP COLUMN "nickname";--> statement-breakpoint