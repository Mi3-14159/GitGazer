-- Custom SQL migration file, put your code below! --
-- Shared across tenants, so only the app's own connection may read them, never the RLS or MCP roles.
REVOKE ALL ON gitgazer.slack_workspaces, gitgazer.slack_user_links FROM gitgazer_reader, gitgazer_writer, gitgazer_mcp;
