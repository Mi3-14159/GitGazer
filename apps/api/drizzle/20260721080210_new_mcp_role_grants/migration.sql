GRANT USAGE ON SCHEMA github TO gitgazer_mcp;--> statement-breakpoint
GRANT SELECT ON TABLE github.enterprises TO gitgazer_mcp;--> statement-breakpoint
GRANT SELECT ON TABLE github.organizations TO gitgazer_mcp;--> statement-breakpoint
GRANT SELECT ON TABLE github.repositories TO gitgazer_mcp;--> statement-breakpoint
GRANT SELECT ON TABLE github.user TO gitgazer_mcp;--> statement-breakpoint
GRANT SELECT ON TABLE github.workflow_runs TO gitgazer_mcp;--> statement-breakpoint
GRANT SELECT ON TABLE github.workflow_jobs TO gitgazer_mcp;--> statement-breakpoint
GRANT SELECT ON TABLE github.workflow_run_pull_requests TO gitgazer_mcp;--> statement-breakpoint
GRANT SELECT ON TABLE github.pull_requests TO gitgazer_mcp;--> statement-breakpoint
-- integrations: column-scoped — `secret` is intentionally omitted so it is unreadable
GRANT SELECT (integration_id, label, created_at) ON TABLE github.integrations TO gitgazer_mcp;