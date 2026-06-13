-- GitHub sends workflow_run.head_branch = null for some events (e.g. pull_request_target),
-- so the NOT NULL constraint caused inserts to fail (23502) and webhook records to dead-letter.
-- The octokit type is `string | null` and workflow_jobs.head_branch was already nullable.
ALTER TABLE "github"."workflow_runs" ALTER COLUMN "head_branch" DROP NOT NULL;