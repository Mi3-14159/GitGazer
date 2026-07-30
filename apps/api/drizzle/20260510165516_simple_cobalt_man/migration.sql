-- Custom SQL migration file, put your code below! --
UPDATE "github"."workflow_jobs" AS wj
SET "sender_id" = wr."actor_id"
FROM "github"."workflow_runs" AS wr
WHERE wj."integration_id" = wr."integration_id"
    AND wj."workflow_run_id" = wr."id"
    AND wj."sender_id" IS NULL;