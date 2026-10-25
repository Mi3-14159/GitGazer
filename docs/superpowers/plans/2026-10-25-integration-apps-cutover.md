# Integration apps cutover runbook

The backfill migration (`integration_apps_backfill`) turns every existing integration into a GitHub app and every distinct Slack webhook URL used by notification rules into a handle of a Webhook app. It runs in one transaction together with the schema migration.

## Steps

1. Announce a freeze of a few minutes: no secret rotation, no integration creation, no notification rule edits.
2. Apply the migrations:

    ```bash
    cd packages/db && pnpm run migrate
    ```

3. Run the verification queries. Every one must return `0`.

    ```sql
    -- GitHub secret and default role copied unchanged
    SELECT count(*) FROM github.integrations i LEFT JOIN gitgazer.integration_app_github_settings s USING (integration_id) WHERE s.secret IS DISTINCT FROM i.secret OR s.org_sync_default_role IS DISTINCT FROM i.org_sync_default_role;

    -- every (rule, channel URL) pair has a matching destination
    SELECT count(*) FROM (SELECT r.integration_id, r.id, c->>'webhook_url' u FROM gitgazer.notification_rules r, jsonb_array_elements(r.channels) c) x
      WHERE NOT EXISTS (SELECT 1 FROM gitgazer.notification_rule_destinations d JOIN gitgazer.webhook_handle_details w USING (integration_id, handle_id) WHERE d.integration_id = x.integration_id AND d.rule_id = x.id AND w.url = x.u);

    -- one handle per distinct URL per integration
    SELECT count(*) FROM (SELECT integration_id, url FROM gitgazer.webhook_handle_details GROUP BY 1, 2 HAVING count(*) > 1) dup;

    -- the MCP role has no grants on the new tables
    SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = 'gitgazer_mcp' AND table_schema = 'gitgazer'
      AND table_name IN ('integration_apps', 'integration_app_github_settings', 'notification_handles', 'webhook_handle_details', 'notification_rule_destinations');
    ```

4. Merge and deploy the branch (`.github/workflows/ci_cd.yaml`).
5. Smoke test: one GitHub delivery is accepted, and one Slack alert is posted for a failed job.
6. Fix forward. Do not roll back the lambdas: the old code no longer matches the schema it reads.

## Expected transient state

The web app is live as soon as it is uploaded, but the new API routes only go live after `terraform apply`. The Apps page (`/apps`) can return 404 for a few minutes. This is covered by fix-forward.
