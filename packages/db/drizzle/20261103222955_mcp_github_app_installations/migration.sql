CREATE POLICY "tenant separation mcp" ON "github"."github_app_installations" AS PERMISSIVE FOR SELECT TO "gitgazer_mcp" USING (integration_id = ANY ((SELECT github.integration_ids())::uuid[]));
--> statement-breakpoint
GRANT SELECT ON TABLE github.github_app_installations TO gitgazer_mcp;
