CREATE TABLE "gitgazer"."mcp_query_usage" (
	"user_id" bigint NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "mcp_query_usage_user_id_window_start_pk" PRIMARY KEY("user_id","window_start")
);
--> statement-breakpoint
ALTER TABLE "gitgazer"."mcp_query_usage" ADD CONSTRAINT "mcp_query_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "gitgazer"."users"("id") ON DELETE cascade ON UPDATE no action;