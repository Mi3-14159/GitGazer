CREATE TABLE "gitgazer"."ws_connections" (
	"integration_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"user_id" bigint NOT NULL,
	"connected_at" bigint NOT NULL,
	CONSTRAINT "ws_connections_connection_id_unique" UNIQUE("connection_id")
);
--> statement-breakpoint
ALTER TABLE "gitgazer"."ws_connections" ADD CONSTRAINT "ws_connections_integration_id_integrations_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "github"."integrations"("integration_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gitgazer"."ws_connections" ADD CONSTRAINT "ws_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "gitgazer"."users"("id") ON DELETE cascade ON UPDATE no action;