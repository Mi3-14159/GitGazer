-- Custom SQL migration file, put your code below! --
-- MCP queries connect as gitgazer_mcp itself (IAM auth), so their session user never owns the tables.
ALTER ROLE gitgazer_mcp WITH LOGIN;--> statement-breakpoint
GRANT rds_iam TO gitgazer_mcp WITH INHERIT TRUE;
