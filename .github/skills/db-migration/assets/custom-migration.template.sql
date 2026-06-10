-- Custom SQL migration file, put your code below! --
-- Generated with: npx drizzle-kit generate --custom --name=<descriptive_name>
-- Use ONLY for things drizzle-kit cannot diff: new roles, one-off GRANTs, data backfills.
-- Do NOT add GRANTs for new ordinary tables — those are inherited via ALTER DEFAULT PRIVILEGES.
-- Separate every statement with the breakpoint marker below (breakpoints: true).

-- Example: create a new read-only role and let it read future tables in both schemas.
CREATE ROLE gitgazer_example NOLOGIN;
--> statement-breakpoint
GRANT USAGE ON SCHEMA gitgazer TO gitgazer_example;
--> statement-breakpoint
GRANT USAGE ON SCHEMA github TO gitgazer_example;
--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA gitgazer TO gitgazer_example;
--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA github TO gitgazer_example;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA gitgazer GRANT SELECT ON TABLES TO gitgazer_example;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA github GRANT SELECT ON TABLES TO gitgazer_example;
