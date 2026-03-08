ALTER TABLE "gitgazer"."users" ADD COLUMN "id" bigint PRIMARY KEY NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "gitgazer"."users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1);--> statement-breakpoint
ALTER TABLE "gitgazer"."users" ADD COLUMN "cognito_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "gitgazer"."users" ADD CONSTRAINT "users_cognito_id_unique" UNIQUE("cognito_id");--> statement-breakpoint
ALTER TABLE "github"."user-assignments" ADD COLUMN "user_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "github"."user-assignments" ADD CONSTRAINT "user-assignments_user_id_integration_id_pk" PRIMARY KEY("user_id","integration_id");--> statement-breakpoint
ALTER TABLE "github"."user-assignments" ADD CONSTRAINT "user-assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "gitgazer"."users"("id") ON DELETE no action ON UPDATE no action;