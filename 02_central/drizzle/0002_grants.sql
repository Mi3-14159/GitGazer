-- Custom SQL migration file, put your code below! --
GRANT USAGE ON SCHEMA gitgazer TO gitgazer_user;

--> statement-breakpoint
GRANT USAGE ON SCHEMA github TO gitgazer_user;

--> statement-breakpoint
GRANT SELECT,
    INSERT,
    UPDATE,
    DELETE ON ALL TABLES IN SCHEMA gitgazer TO gitgazer_user;

--> statement-breakpoint
GRANT SELECT,
    INSERT,
    UPDATE,
    DELETE ON ALL TABLES IN SCHEMA github TO gitgazer_user;

--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA gitgazer
GRANT SELECT,
    INSERT,
    UPDATE,
    DELETE ON TABLES TO gitgazer_user;

--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA github
GRANT SELECT,
    INSERT,
    UPDATE,
    DELETE ON TABLES TO gitgazer_user;