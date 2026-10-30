import {registerTool} from '@/domains/mcp/mcp.tools';
import {deleteNotificationRule, updateNotificationRule, upsertNotificationRule} from '@/domains/notifications/notifications.controller';
import {NotFoundError} from '@/shared/errors';
import type {McpServer} from '@modelcontextprotocol/server';
import {z} from 'zod';

const integrationId = z.string().uuid().describe('The integration the rule belongs to.');
const ruleId = z.string().uuid().describe('Look up rule ids in gitgazer.notification_rules_view with run_sql.');
const label = z.string().trim().min(1).max(100);
const handleIds = z
    .array(z.string().uuid())
    .max(20)
    .describe('Destination handle ids; look them up in gitgazer.notification_handles_view with run_sql.');
const enabled = z.boolean();
const ignoreDependabot = z.boolean();
const includeLogDetails = z.boolean().optional();
const rule = z.object({
    owner: z.string().optional(),
    repository_name: z.string().optional(),
    workflow_name: z.string().optional(),
    head_branch: z.string().optional(),
    topics: z.array(z.string().max(100)).max(50).optional(),
});

const MEMBER_NOTE = 'Requires the member role in the integration.';

export const registerNotificationRuleTools = (server: McpServer): void => {
    registerTool(
        server,
        'create_notification_rule',
        {
            description: `Create a notification rule that sends matching workflow results to the given destination handles. ${MEMBER_NOTE}`,
            inputSchema: z.object({
                integration_id: integrationId,
                label,
                handle_ids: handleIds,
                enabled,
                ignore_dependabot: ignoreDependabot,
                include_log_details: includeLogDetails,
                rule,
            }),
            annotations: {readOnlyHint: false},
        },
        ({integration_id, handle_ids, ...fields}) =>
            upsertNotificationRule({rule: {...fields, handleIds: handle_ids}, integrationId: integration_id, createOnly: true, source: 'mcp'}),
    );

    registerTool(
        server,
        'update_notification_rule',
        {
            description: `Change a notification rule. Only the fields you pass are changed; "rule" and "handle_ids" replace the stored value as a whole. ${MEMBER_NOTE}`,
            inputSchema: z.object({
                integration_id: integrationId,
                rule_id: ruleId,
                label: label.optional(),
                handle_ids: handleIds.optional(),
                enabled: enabled.optional(),
                ignore_dependabot: ignoreDependabot.optional(),
                include_log_details: includeLogDetails,
                rule: rule.optional(),
            }),
            annotations: {readOnlyHint: false},
        },
        ({integration_id, rule_id, handle_ids, ...fields}) => {
            // The controller spreads `changes` over the stored rule, so an explicit undefined would erase a stored value.
            const changes = Object.fromEntries(Object.entries({...fields, handleIds: handle_ids}).filter(([, value]) => value !== undefined));
            return updateNotificationRule({integrationId: integration_id, ruleId: rule_id, changes, source: 'mcp'});
        },
    );

    registerTool(
        server,
        'delete_notification_rule',
        {
            description: `Permanently delete a notification rule. ${MEMBER_NOTE}`,
            inputSchema: z.object({integration_id: integrationId, rule_id: ruleId}),
            annotations: {readOnlyHint: false, destructiveHint: true},
        },
        async ({integration_id, rule_id}) => {
            if (!(await deleteNotificationRule(rule_id, integration_id, 'mcp'))) throw new NotFoundError('Notification rule not found');
            return {deleted: true, rule_id};
        },
    );
};
