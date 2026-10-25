# Integration apps cutover runbook

The backfill migration (`integration_apps_backfill`) turns every existing integration into a GitHub app and every distinct Slack webhook URL used by notification rules into a handle of a Webhook app. It runs in one transaction together with the schema migration.

## Steps

1. Announce a freeze of a few minutes until the post-deploy re-check: no secret rotation, no integration creation, no change to the org-sync default role, no notification rule edits.
2. Pre-flight, before the migration. Every query must return `0`. Fix the offending rules first.

    ```sql
    -- a. channels without a URL: the backfill would abort on the NOT NULL URL in the middle of the freeze
    SELECT count(*) FROM gitgazer.notification_rules r, jsonb_array_elements(r.channels) c WHERE coalesce(c->>'webhook_url','') = '';

    -- b. integrations with more than 20 distinct webhook URLs across their rules: they would get a Webhook app above its 20-handle cap
    SELECT count(*) FROM (
      SELECT r.integration_id FROM gitgazer.notification_rules r, jsonb_array_elements(r.channels) c
      GROUP BY r.integration_id HAVING count(DISTINCT c->>'webhook_url') > 20
    ) x;

    -- c. rules with more than 20 distinct channel URLs: they would get more than the 20 handleIds a rule save accepts
    SELECT count(*) FROM (
      SELECT r.integration_id, r.id FROM gitgazer.notification_rules r, jsonb_array_elements(r.channels) c
      GROUP BY r.integration_id, r.id HAVING count(DISTINCT c->>'webhook_url') > 20
    ) x;
    ```

    Neither b nor c is expected to find anything. If either does, consolidate before the cutover: point those rules at fewer Slack webhook URLs (for example one channel per team instead of one per repository), so that each integration uses at most 20 distinct URLs and each rule at most 20, then re-run the pre-flight. The 20 limit stays, since the backfill copies channels as they are and the API would then reject edits to such rules.

3. Apply the migrations:

    ```bash
    cd packages/db && pnpm run migrate
    ```

4. Run the verification queries. Every one must return `0`, except the MCP check, where every row must be `false`.

    ```sql
    -- 1. GitHub secret and default role copied unchanged
    SELECT count(*) FROM github.integrations i LEFT JOIN gitgazer.integration_app_github_settings s USING (integration_id) WHERE s.secret IS DISTINCT FROM i.secret OR s.org_sync_default_role IS DISTINCT FROM i.org_sync_default_role;

    -- 2. every (rule, channel URL) pair has a matching destination
    SELECT count(*) FROM (SELECT r.integration_id, r.id, c->>'webhook_url' u FROM gitgazer.notification_rules r, jsonb_array_elements(r.channels) c) x
      WHERE NOT EXISTS (SELECT 1 FROM gitgazer.notification_rule_destinations d JOIN gitgazer.webhook_handle_details w USING (integration_id, handle_id) WHERE d.integration_id = x.integration_id AND d.rule_id = x.id AND w.url = x.u);

    -- 3. one handle per distinct URL per integration
    SELECT count(*) FROM (SELECT integration_id, url FROM gitgazer.webhook_handle_details GROUP BY 1, 2 HAVING count(*) > 1) dup;

    -- 4. the MCP role has no SELECT on the new tables (all five must be false)
    SELECT t, has_table_privilege('gitgazer_mcp', 'gitgazer.' || t, 'SELECT') AS can_select
      FROM unnest(ARRAY['integration_apps', 'integration_app_github_settings', 'notification_handles', 'webhook_handle_details', 'notification_rule_destinations']) AS t;
    ```

5. Merge and deploy the branch (`.github/workflows/ci_cd.yaml`).
6. Post-deploy re-check, after `terraform apply`. It catches changes made during the CI window, which the freeze should have prevented. Re-run queries 1 and 2, then:

    ```sql
    -- every integration has a GitHub app (must be 0)
    SELECT count(*) FROM github.integrations i WHERE NOT EXISTS (SELECT 1 FROM gitgazer.integration_apps a WHERE a.integration_id = i.integration_id AND a.type = 'github');
    ```

7. Smoke test: one GitHub delivery is accepted, and one Slack alert is posted for a failed job.
8. End the freeze. Fix forward. Do not roll back the lambdas: the old code no longer matches the schema it reads.

## Expected transient state

The web app is live as soon as it is uploaded, but the new API routes only go live after `terraform apply`. For a few minutes:

- The Apps page (`/apps`) can return 404.
- With the new web app and the old API, the Notifications page breaks (`rule.handleIds` is undefined) and rule saves fail with 400.
- With a cached old SPA and the new API, rule saves fail with 400 until a hard refresh.

The short freeze and fix-forward cover all three.
