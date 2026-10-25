INSERT INTO gitgazer.integration_apps (integration_id, type)
SELECT integration_id, 'github' FROM github.integrations;
--> statement-breakpoint
INSERT INTO gitgazer.integration_app_github_settings (integration_id, app_id, secret, org_sync_default_role)
SELECT a.integration_id, a.app_id, i.secret, i.org_sync_default_role
FROM gitgazer.integration_apps a JOIN github.integrations i USING (integration_id)
WHERE a.type = 'github';
--> statement-breakpoint
CREATE TEMP TABLE migrated_handles ON COMMIT DROP AS
WITH urls AS (
  SELECT r.integration_id, c->>'webhook_url' AS url, min(r.created_at) AS first_used
  FROM gitgazer.notification_rules r, jsonb_array_elements(r.channels) c
  GROUP BY r.integration_id, c->>'webhook_url'
)
SELECT integration_id, url, gen_random_uuid() AS handle_id,
       'Slack webhook ' || row_number() OVER (PARTITION BY integration_id ORDER BY first_used, url) AS name
FROM urls;
--> statement-breakpoint
INSERT INTO gitgazer.integration_apps (integration_id, type)
SELECT DISTINCT integration_id, 'webhook' FROM migrated_handles;
--> statement-breakpoint
INSERT INTO gitgazer.notification_handles (integration_id, handle_id, app_id, name)
SELECT m.integration_id, m.handle_id, a.app_id, m.name
FROM migrated_handles m JOIN gitgazer.integration_apps a ON a.integration_id = m.integration_id AND a.type = 'webhook';
--> statement-breakpoint
INSERT INTO gitgazer.webhook_handle_details (integration_id, handle_id, url)
SELECT integration_id, handle_id, url FROM migrated_handles;
--> statement-breakpoint
INSERT INTO gitgazer.notification_rule_destinations (integration_id, rule_id, handle_id)
SELECT DISTINCT r.integration_id, r.id, m.handle_id
FROM gitgazer.notification_rules r, jsonb_array_elements(r.channels) c
JOIN migrated_handles m ON m.url = c->>'webhook_url'
WHERE m.integration_id = r.integration_id;
