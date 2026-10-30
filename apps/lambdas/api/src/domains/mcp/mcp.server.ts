import {registerMcpTools} from '@/domains/mcp/mcp.tools';
import {McpServer} from '@modelcontextprotocol/server';

const INSTRUCTIONS = [
    'Query your GitHub Actions and pull-request data with run_sql (a single read-only SELECT or WITH).',
    'The GitHub tables live in the "github" schema, and "user" is a reserved word that must be double-quoted.',
    'Rows are multi-tenant and ids are only unique per integration, so every join must match on integration_id as well as the id column.',
    'Configuration views (gitgazer.integration_apps_view, gitgazer.notification_rules_view, github.user_assignments_view and others) show only what your role in each integration allows; columns you may not see are NULL.',
    'gitgazer.users_view and gitgazer.slack_workspaces_view are global with no integration_id; gitgazer.users_view holds GitGazer users and github."user" holds GitHub actors.',
].join(' ');

const WRITE_INSTRUCTIONS =
    'This session can change notification rules with create_notification_rule, update_notification_rule and delete_notification_rule; look up rule ids in gitgazer.notification_rules_view and destination handle ids in gitgazer.notification_handles_view.';

export const createMcpServer = ({write}: {write: boolean}): McpServer => {
    // The SDK defaults tools.listChanged to true, which makes subscriptions/listen hold an SSE stream open
    // until the Lambda times out; the tool list never changes, so there is nothing to listen for.
    const server = new McpServer(
        {name: 'gitgazer-mcp', version: '1.0.0'},
        {instructions: write ? `${INSTRUCTIONS} ${WRITE_INSTRUCTIONS}` : INSTRUCTIONS, capabilities: {tools: {listChanged: false}}},
    );
    registerMcpTools(server, {write});
    return server;
};
