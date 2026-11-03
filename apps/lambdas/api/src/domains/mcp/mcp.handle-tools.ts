import {createHandle, deleteHandle, listSlackChannels, updateHandle} from '@/domains/apps/apps.controller';
import {McpToolError, registerTool} from '@/domains/mcp/mcp.tools';
import type {McpServer} from '@modelcontextprotocol/server';
import {z} from 'zod';

const integrationId = z.string().uuid().describe('The integration the app or handle belongs to.');
const appId = z.string().uuid().describe('Look up app ids and types in gitgazer.integration_apps_view with run_sql.');
const handleId = z.string().uuid().describe('Look up handle ids in gitgazer.notification_handles_view with run_sql.');
const name = z.string();
const url = z.string().url();

const ADMIN_NOTE = 'Requires the admin role in the integration.';

export const registerSlackChannelTool = (server: McpServer): void => {
    registerTool(
        server,
        'list_slack_channels',
        {
            description: `List the Slack channels a Slack app can post to, for create_notification_handle. ${ADMIN_NOTE}`,
            inputSchema: z.object({
                integration_id: integrationId,
                app_id: appId.describe('The Slack app; look up app ids and types in gitgazer.integration_apps_view with run_sql.'),
            }),
        },
        ({integration_id, app_id}) => listSlackChannels({integrationId: integration_id, integrationIds: [integration_id], appId: app_id}),
    );
};

export const registerHandleTools = (server: McpServer): void => {
    registerTool(
        server,
        'create_notification_handle',
        {
            description: `Create a notification destination in an app. For a Slack app pass channel_id (from list_slack_channels); for a webhook app pass name and url. ${ADMIN_NOTE}`,
            inputSchema: z.object({
                integration_id: integrationId,
                app_id: appId,
                channel_id: z.string().optional().describe('Slack channel id, from list_slack_channels.'),
                name: name.optional(),
                url: url.optional(),
            }),
            annotations: {readOnlyHint: false},
        },
        ({integration_id, app_id, channel_id, name, url}) => {
            const scope = {integrationId: integration_id, integrationIds: [integration_id], appId: app_id, source: 'mcp' as const};
            if (channel_id !== undefined && name === undefined && url === undefined) return createHandle({...scope, channelId: channel_id});
            if (channel_id === undefined && name !== undefined && url !== undefined) return createHandle({...scope, name, url});
            throw new McpToolError('Pass either channel_id (Slack app) or both name and url (webhook app), not a mix.');
        },
    );

    registerTool(
        server,
        'update_notification_handle',
        {
            description: `Change a webhook handle. Only the fields you pass are changed. ${ADMIN_NOTE}`,
            inputSchema: z.object({integration_id: integrationId, handle_id: handleId, name: name.optional(), url: url.optional()}),
            annotations: {readOnlyHint: false},
        },
        ({integration_id, handle_id, name, url}) =>
            updateHandle({integrationId: integration_id, integrationIds: [integration_id], handleId: handle_id, name, url, source: 'mcp'}),
    );

    registerTool(
        server,
        'delete_notification_handle',
        {
            description: `Permanently delete a notification handle. Rules that send to this handle lose this destination. ${ADMIN_NOTE}`,
            inputSchema: z.object({integration_id: integrationId, handle_id: handleId}),
            annotations: {readOnlyHint: false, destructiveHint: true},
        },
        async ({integration_id, handle_id}) => {
            await deleteHandle({integrationId: integration_id, integrationIds: [integration_id], handleId: handle_id, source: 'mcp'});
            return {deleted: true, handle_id};
        },
    );
};
