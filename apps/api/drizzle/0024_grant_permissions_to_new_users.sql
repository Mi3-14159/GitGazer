-- Custom SQL migration file, put your code below! --
-- Grant USAGE on schemas
GRANT USAGE ON SCHEMA gitgazer TO gitgazer_reader;--> statement-breakpoint
GRANT USAGE ON SCHEMA gitgazer TO gitgazer_writer;--> statement-breakpoint
GRANT USAGE ON SCHEMA github TO gitgazer_reader;--> statement-breakpoint
GRANT USAGE ON SCHEMA github TO gitgazer_writer;--> statement-breakpoint
-- Grant SELECT on all existing tables
GRANT SELECT ON ALL TABLES IN SCHEMA gitgazer TO gitgazer_reader;--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA gitgazer TO gitgazer_writer;--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA github TO gitgazer_reader;--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA github TO gitgazer_writer;--> statement-breakpoint
-- Grant SELECT on future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA gitgazer GRANT SELECT ON TABLES TO gitgazer_reader;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA gitgazer GRANT SELECT ON TABLES TO gitgazer_writer;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA github GRANT SELECT ON TABLES TO gitgazer_reader;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA github GRANT SELECT ON TABLES TO gitgazer_writer;