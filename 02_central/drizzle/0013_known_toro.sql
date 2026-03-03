ALTER TABLE "gitgazer"."ws_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gitgazer"."ws_connections" DROP CONSTRAINT "ws_connections_connection_id_unique";--> statement-breakpoint
ALTER TABLE "gitgazer"."ws_connections" ADD CONSTRAINT "ws_connections_integration_id_connection_id_user_id_pk" PRIMARY KEY("integration_id","connection_id","user_id");--> statement-breakpoint
CREATE INDEX "ws_connections_connection_id_idx" ON "gitgazer"."ws_connections" USING btree ("connection_id");--> statement-breakpoint
CREATE POLICY "tenant separation" ON "gitgazer"."ws_connections" AS PERMISSIVE FOR ALL TO "gitgazer_user" USING (integration_id = ANY(string_to_array(NULLIF(current_setting('rls.integration_ids', TRUE), ''), ',')::uuid[]));