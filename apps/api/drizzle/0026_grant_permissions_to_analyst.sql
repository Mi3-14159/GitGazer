-- Custom SQL migration file, put your code below! --
-- Grant USAGE on schemas
GRANT USAGE ON SCHEMA github TO gitgazer_analyst;--> statement-breakpoint
-- Grant SELECT on all existing tables
GRANT SELECT ON TABLE github.enterprises TO gitgazer_analyst;--> statement-breakpoint
GRANT SELECT ON TABLE github.organizations TO gitgazer_analyst;--> statement-breakpoint
GRANT SELECT ON TABLE github.pull_requests TO gitgazer_analyst;--> statement-breakpoint
GRANT SELECT ON TABLE github.repositories TO gitgazer_analyst;--> statement-breakpoint
GRANT SELECT ON TABLE github.user TO gitgazer_analyst;--> statement-breakpoint
GRANT SELECT ON TABLE github.workflow_jobs TO gitgazer_analyst;--> statement-breakpoint
GRANT SELECT ON TABLE github.workflow_runs TO gitgazer_analyst;--> statement-breakpoint
GRANT SELECT ON TABLE github.workflow_run_pull_requests TO gitgazer_analyst;