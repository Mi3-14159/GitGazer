import {updateWebhookEvents, upsertIntegration} from '@/domains/integrations/integrations.controller';
import {McpToolError, registerTool} from '@/domains/mcp/mcp.tools';
import {markAllEventLogRead, toggleEventLogRead} from '@gitgazer/backend-services/event-log.controller';
import {GITHUB_APP_WEBHOOK_EVENTS} from '@gitgazer/db/types';
import type {McpServer} from '@modelcontextprotocol/server';
import {z} from 'zod';

const integrationId = z.string().uuid().describe('The integration to change.');

export const registerIntegrationTools = (server: McpServer): void => {
    registerTool(
        server,
        'rename_integration',
        {
            description: 'Rename an integration. Requires the admin role in the integration.',
            inputSchema: z.object({integration_id: integrationId, label: z.string().trim().min(1).max(255)}),
            annotations: {readOnlyHint: false},
        },
        ({integration_id, label}) => upsertIntegration({id: integration_id, label, integrationIds: [integration_id], source: 'mcp'}),
    );

    registerTool(
        server,
        'update_webhook_events',
        {
            description:
                'Set which GitHub webhook events a GitHub App installation delivers to the integration. Requires the admin role in the integration. Dropping workflow_run or workflow_job stops GitGazer from receiving GitHub Actions data.',
            inputSchema: z.object({
                integration_id: integrationId,
                installation_id: z.number().int().describe('From github.github_app_installations; look it up with run_sql.'),
                events: z.array(z.enum(GITHUB_APP_WEBHOOK_EVENTS)).min(1),
            }),
            annotations: {readOnlyHint: false},
        },
        ({integration_id, installation_id, events}) =>
            updateWebhookEvents({integrationId: integration_id, installationId: installation_id, events, source: 'mcp'}),
    );

    registerTool(
        server,
        'set_event_log_read',
        {
            description: 'Mark one event log entry as read or unread. Look up entry ids in gitgazer.event_log_entries_view with run_sql.',
            inputSchema: z.object({id: z.string().uuid(), read: z.boolean()}),
            annotations: {readOnlyHint: false},
        },
        async ({id, read}, caller) => {
            const entry = await toggleEventLogRead({id, integrationIds: Object.keys(caller.integrationRoles), read});
            if (!entry) throw new McpToolError('Event log entry not found');
            return entry;
        },
    );

    registerTool(
        server,
        'mark_all_event_log_read',
        {
            description: 'Mark every event log entry in all your integrations as read.',
            inputSchema: z.object({}),
            annotations: {readOnlyHint: false},
        },
        async (_args, caller) => ({updated: await markAllEventLogRead({integrationIds: Object.keys(caller.integrationRoles)})}),
    );
};
