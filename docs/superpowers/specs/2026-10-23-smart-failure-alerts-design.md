# Smart failure alerts — design

Status: ready for product-owner approval · 2026-10-24

## Why

GitGazer's Slack alert today says only _that_ a job failed (workflow, repo, conclusion, event, sender). The
person who gets it clicks through to GitHub, finds the failed job, scrolls the log to the error and works out
whether it is their change, a flaky test or broken infrastructure.

Plain "a job failed" notifications are free elsewhere (GitHub's Slack app, GitHub's own Actions metrics), so they
are not a reason to use GitGazer. An alert that already answers "why did it fail, and is it real?" is what paid
tools charge for, and it builds on data GitGazer already stores. The first users are the teams in our own
company that already receive GitGazer alerts.

## Goals

- A reader of the alert knows within seconds whether to act, rerun or ignore, without opening GitHub in most cases.
- Every alert says whether the failure looks flaky or real, with the evidence behind that verdict.
- Every alert (where logs are reachable) carries a short AI explanation and the actual error lines from the log.

## Non-goals (this iteration)

- A Slack app: interactive buttons (rerun job, mute as flaky), slash commands, OAuth install. Decided to do later.
- Mapping GitHub users to Slack users for real `@mentions`.
- Test-level analytics (JUnit upload), weekly CI health / cost reports.
- Changing how rules are matched, or the one-message-per-failed-job behavior.

## Anti-goals (failure even if it technically works)

- Confident but wrong summaries that teach people to distrust the alert.
- Longer, noisier alerts that make people mute the channel.
- Log contents going anywhere other than the GitGazer AWS account and the Slack channels of rules that opted in
  to log details; secrets appearing in Slack.
- Alerts that arrive late, twice, or not at all because the enrichment step failed.

## Decided with the product owner

- **Rich alert layout** (mockup option B; see below).
- **AI runs on Amazon Bedrock in the same AWS account as GitGazer.** Logs are only processed inside that account;
  the only place log-derived text leaves it is the Slack channel of a rule that opted in (next point).
- **Each notification rule chooses whether to show log details** (error excerpt + AI summary). The flaky/real
  verdict is always shown.
- **Goes live for every integration at once**, internal and external. No per-integration opt-in.
- **Both integration types are supported, with what each can offer.** The GitGazer GitHub App now has
  _Actions: read_, so App integrations get log details. Integrations set up with a manually configured webhook
  (no App) get only what's available without logs: header, verdict, footer, buttons. GitGazer does **not** store
  user-provided GitHub tokens.
- **Log details default:** off for rules that exist at migration time, on for newly created rules.
- **Slack app later.** This iteration keeps posting through the existing incoming-webhook URLs, so the alert only
  has link buttons.

## The alert

One Slack message per failed job, posted to every channel of every matching rule (rule matching unchanged,
see `packages/backend-services/src/alerting.controller.ts`).

```
[color bar: red = likely real, amber = probably flaky, grey = no verdict]
CI / e2e failed · checkout-service · main                      <- header: workflow / job · repo · branch
[Probably flaky]  failed 4 of last 30 runs; 3 passed on rerun   <- verdict + evidence (deterministic)
🔎 Timeout waiting for #pay-button in checkout.spec.ts. Same     <- AI summary, 1-3 sentences
   error as recent flaky failures. Commit looks unrelated.
┌ ✖ checkout › pays with saved card (30012ms)                   <- error excerpt from the log, verbatim
│   TimeoutError: locator('#pay-button') not visible …
└   at checkout.spec.ts:57:18
pushed by asmith · pull_request · run #8813 · attempt 1          <- footer
[Open failed step] [Open PR]                                     <- link buttons only
```

Mockup: `2026-10-23-smart-failure-alerts-mockup.html` next to this file (HTML fragment; option B is the chosen
one; its rerun/mute buttons are out of scope for now).

### Degradation (always send something)

| Situation                                                                                                     | Alert contains                                                        |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Everything works                                                                                              | header, verdict, summary, excerpt, footer, buttons                    |
| Rule has log details turned off                                                                               | header, verdict, footer, buttons (no log is fetched, no Bedrock call) |
| AI call fails, times out, is over budget, or is blocked                                                       | everything except the summary                                         |
| Log can't be fetched (manual-webhook integration, installation hasn't accepted the new permission, API error) | header, verdict, footer, buttons                                      |
| Not enough history for a verdict                                                                              | no verdict label, grey bar                                            |

An enrichment failure never delays the alert past the timeout below and never drops it.

## Verdict: flaky vs. real (deterministic, no AI)

Computed from `github.workflow_jobs` / `github.workflow_runs` for the same integration, repository, workflow
and job name. Signals:

1. **Rerun recovery** — the same job failed and then succeeded on a later `run_attempt` of the same run (each
   attempt gets its own job id under the same `run_id` in `workflow_jobs`). This is the strongest flaky signal.
   Matching across _different_ runs of the same commit would need a `head_sha` column, which neither
   `workflow_jobs` nor `workflow_runs` stores today; out of scope for now (builder's call to add it for future history).
2. **Failure rate** — share of failures in the last N completed runs of this job.
3. **Default-branch streak** — consecutive passes of this job on the default branch before this failure.

Labels: "Probably flaky", "Likely a real failure", or none when history is too thin. The thresholds and N are the
builder's call (suggested start: N = 30, flaky if ≥ 2 rerun recoveries in that window). The evidence text shows the numbers
that drove the label. The existing `workflow_runs_recovery_lookup` index is run-level (no job name), so job-level
queries likely need their own index.

The verdict is computed for every integration, including manual-webhook ones.

## Per-rule "log details" setting

- New boolean on the notification rule, shown in the rule editor in the web app (`apps/web`, notifications
  components) and accepted by the notifications API. Label along the lines of "Include log details (error lines
  and AI summary)", with a hint that everyone in the Slack channel will see them.
- Rules that exist at migration time get **off**; newly created rules default to **on**.
- For manual-webhook integrations the setting has no effect; the rule editor says log details need the GitHub App.
- If any matching rule for a failed job has it on, the log is fetched and summarized once; each rule's message
  includes or omits the details according to its own setting.

## Getting logs for both integration types

- **GitHub App integrations:** installation token via `getInstallationOctokit`
  (`packages/backend-core/src/clients/github-app.client.ts`). Installations that haven't accepted the new
  _Actions: read_ permission yet get a 403; treat it as "log can't be fetched". The `new_permissions_accepted`
  branch in `apps/lambdas/api/src/domains/github-app/github-app.controller.ts` needs no special handling beyond
  logging, since the next failure simply succeeds.
- **Manual-webhook integrations:** no token, so no log fetch and no Bedrock call. They get verdict-only alerts.

## Log excerpt (deterministic)

- Fetch the failed job's log via `GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs` with the token from the
  section above.
- Take the failed step's section and pick lines around GitHub's `##[error]` markers. Fall back to the last lines
  of the failed step.
- Cap the excerpt (about 10 lines / 1,500 characters) and keep it well inside Slack's 3,000-character section limit.
- Run a redaction pass for obvious secret shapes (tokens, keys, `Bearer …`, URLs with credentials) before the
  excerpt goes to Slack or Bedrock. GitHub's masking is the first line of defense, not the only one.

## AI summary

- Bedrock Converse API from the enrichment Lambda, `maxTokens` set explicitly (about 300).
- Model: Claude Haiku (fast and cheap enough per failure) via an **EU geographic inference profile** (`eu.` prefix)
  so data stays in the EU. GitGazer runs in `eu-central-1`. The exact model ID is the builder's call after
  checking `aws bedrock list-inference-profiles`.
- Input: the redacted log tail of the failed step (capped, about 8k tokens), job/workflow/branch names, the verdict
  and its evidence, and the commit message / PR title if known. No other repository content.
- Output: 1–3 plain sentences: what failed, where (file:line if visible), whether the change looks related.
  The prompt tells the model to say "unclear" rather than guess.
- **Budget guard:** a per-integration daily cap on summaries (precedent: the time-based quota for MCP queries,
  `mcpQueryUsage` in `packages/db/src/schema/gitgazer.ts`). Over the cap, the alert ships without a summary.
- Precedent in infra: `infra/analytics_bedrock.tf` (guardrail with EU guardrail profile),
  `infra/bedrock_logging.tf`, and Bedrock IAM statements in `infra/api_rest_lambda.tf`. Reuse the patterns.
- **The worker reaches Bedrock through a Step Functions Express workflow** (synchronous `StartSyncExecution` over
  the dual-stack endpoint): its subnets have IPv6-only egress and Bedrock Runtime has no IPv6 endpoint. The
  workflow's logging excludes execution data, so prompts never reach CloudWatch through it.
- **Bedrock invocation logging is on** (`enable_bedrock_invocation_logging = true`, 30-day CloudWatch retention), so
  prompts containing log text will be stored there. That stays inside the account, which matches the
  decision, but it means the redaction pass matters.

## Where it runs

Today `sendWorkflowJobAlerts` runs as a post-commit side effect inside webhook ingestion
(`apps/lambdas/worker/src/batch-processor.ts`). **Enrichment stays inline there** (product-owner decision, to keep
it simple): no new queue or lambda.

- `sendWorkflowJobAlerts` matches rules as today, then computes the verdict, fetches the log and calls Bedrock
  only if a matching rule wants log details and the integration has a GitHub App installation, builds the
  Slack payload and posts it.
- Log fetch and Bedrock call each get a hard timeout (a few seconds); on timeout the alert goes out without
  that part.
- **Ingest in order, alert in parallel.** The worker processes up to 10 records per invocation
  (`apps/lambdas/worker/src/index.ts`, `batch_size = 10` and 120 s timeout in `infra/`). Ingestion stays
  sequential: the FIFO queue's ordering is what lets `insertEvent` detect stale events. Alerts are collected while
  the records are ingested and sent after the loop, in parallel with a concurrency cap of about 5 (protects
  Bedrock, the HTTP proxy Lambda and GitHub rate limits). A failing matrix build with 10 failed jobs then costs
  roughly 10–20 s instead of ~100 s. Slack messages within one batch may arrive in a different order than the
  jobs failed; that's acceptable. WebSocket pushes stay per record, in order.
- **Time guard.** Before enriching an alert, check the invocation's remaining time and skip enrichment (send the
  plain verdict alert) when it is below a safety margin (about 30 s). A Lambda timeout would fail the whole batch,
  delay ingestion of every event in it and replay it after the visibility timeout.
- Alert failures still never fail an SQS record (same as today's post-commit side-effect handling).
- The worker's IAM role needs `bedrock:InvokeModel` on the chosen inference profile (pattern in
  `infra/api_rest_lambda.tf`).
- **Idempotency:** SQS retries or webhook redeliveries must never double-post. The existing stale guard covers
  this: `upsertWorkflowJobs` only updates a job when `completed_at` is newer, so a replayed `completed` event is
  `stale` and doesn't alert. (Found while planning; no extra dedupe store needed.)
- The event-log entry written today keeps being written, with the verdict added to its metadata.

## Constraints the builder must handle

- **HTTP proxy.** Outbound GitHub calls go through `apps/lambdas/http-proxy` (host allowlist, Lambda
  request/response payload). The log endpoint answers with a 302 to a different host; the proxy's `fetch`
  follows redirects, but the response comes back as a Lambda payload (6 MB sync limit) and logs can be larger.
  The proxy or the caller must cap or tail the body.
- Slack incoming webhooks: link buttons only, `mrkdwn` sections ≤ 3,000 characters, ≤ 50 blocks.
- Mentions are plain text GitHub logins (no Slack user mapping yet).

## Left to the builder

Exact thresholds for the verdict, the prompt wording, the Bedrock model ID and timeout values, the dedupe store, the block layout details, and the tests.
All AWS access is mocked in unit tests (repo convention).

## Calls made by Claude (not explicitly confirmed by the product owner)

- The per-rule switch covers both the excerpt and the AI summary (the summary paraphrases the log); the verdict is always shown.
- Verdict is deterministic, not AI-generated.
- Claude Haiku via an EU inference profile; per-integration daily summary cap.
- Mentions are plain text in this iteration.
