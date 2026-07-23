ALTER TABLE "gitgazer"."mcp_query_usage" ADD COLUMN "consumed_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "gitgazer"."mcp_query_usage" DROP COLUMN "count";