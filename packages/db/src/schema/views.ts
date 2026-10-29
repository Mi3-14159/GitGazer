import {and, inArray, ne, or, sql, type AnyColumn, type SQL} from 'drizzle-orm';
import type {QueryBuilder} from 'drizzle-orm/pg-core';
import type {MemberRole} from '../types';
import {
    eventLogEntries,
    gitgazerSchema,
    integrationAppGithubSettings,
    integrationApps,
    integrationAppSlackSettings,
    integrationInvitations,
    notificationHandles,
    notificationRuleDestinations,
    notificationRules,
    slackHandleDetails,
    slackWorkspaces,
    users,
    webhookHandleDetails,
} from './gitgazer';
import {githubSchema, userAssignments} from './github';

// The views run as their owner, so base-table RLS does not apply: these filters are the tenant boundary.
const rowsFor = (integrationId: AnyColumn, minimumRole: MemberRole): SQL =>
    sql`${integrationId} = ANY ((SELECT github.integration_ids(${sql.raw(`'${minimumRole}'`)}))::uuid[])`;

const onlyFor = <T>(integrationId: AnyColumn, minimumRole: MemberRole, column: AnyColumn & {_: {data: T}}) =>
    sql<T | null>`CASE WHEN ${rowsFor(integrationId, minimumRole)} THEN ${column} END`.as(column.name);

const usersFor = (qb: QueryBuilder, minimumRole: MemberRole) =>
    qb.select({userId: userAssignments.userId}).from(userAssignments).where(rowsFor(userAssignments.integrationId, minimumRole));

// The same rows as integration_invitations_view, so its inviter and invitee are visible wherever the invitation is.
const invitationUsersFor = (
    qb: QueryBuilder,
    user: typeof integrationInvitations.invitedBy | typeof integrationInvitations.inviteeId,
    minimumRole: MemberRole,
) =>
    qb
        .select({userId: user})
        .from(integrationInvitations)
        .where(and(ne(integrationInvitations.status, 'accepted'), rowsFor(integrationInvitations.integrationId, minimumRole)));

const visibleUsers = (qb: QueryBuilder, assignedRole: MemberRole, invitationRole: MemberRole) =>
    or(
        inArray(users.id, usersFor(qb, assignedRole)),
        inArray(users.id, invitationUsersFor(qb, integrationInvitations.invitedBy, invitationRole)),
        inArray(users.id, invitationUsersFor(qb, integrationInvitations.inviteeId, invitationRole)),
    );

export const integrationAppsView = gitgazerSchema
    .view('integration_apps_view')
    .with({securityBarrier: true})
    .as((qb) =>
        qb
            .select({
                integrationId: integrationApps.integrationId,
                appId: integrationApps.appId,
                type: integrationApps.type,
                createdAt: integrationApps.createdAt,
            })
            .from(integrationApps)
            .where(rowsFor(integrationApps.integrationId, 'viewer')),
    );

export const integrationAppGithubSettingsView = gitgazerSchema
    .view('integration_app_github_settings_view')
    .with({securityBarrier: true})
    .as((qb) =>
        qb
            .select({
                integrationId: integrationAppGithubSettings.integrationId,
                appId: integrationAppGithubSettings.appId,
                secret: onlyFor(integrationAppGithubSettings.integrationId, 'admin', integrationAppGithubSettings.secret),
                orgSyncDefaultRole: integrationAppGithubSettings.orgSyncDefaultRole,
            })
            .from(integrationAppGithubSettings)
            .where(rowsFor(integrationAppGithubSettings.integrationId, 'viewer')),
    );

export const integrationAppSlackSettingsView = gitgazerSchema
    .view('integration_app_slack_settings_view')
    .with({securityBarrier: true})
    .as((qb) =>
        qb
            .select({
                integrationId: integrationAppSlackSettings.integrationId,
                appId: integrationAppSlackSettings.appId,
                teamId: integrationAppSlackSettings.teamId,
            })
            .from(integrationAppSlackSettings)
            .where(rowsFor(integrationAppSlackSettings.integrationId, 'viewer')),
    );

export const notificationHandlesView = gitgazerSchema
    .view('notification_handles_view')
    .with({securityBarrier: true})
    .as((qb) =>
        qb
            .select({
                integrationId: notificationHandles.integrationId,
                handleId: notificationHandles.handleId,
                appId: notificationHandles.appId,
                name: notificationHandles.name,
                createdAt: notificationHandles.createdAt,
                updatedAt: notificationHandles.updatedAt,
            })
            .from(notificationHandles)
            .where(rowsFor(notificationHandles.integrationId, 'viewer')),
    );

export const webhookHandleDetailsView = gitgazerSchema
    .view('webhook_handle_details_view')
    .with({securityBarrier: true})
    .as((qb) =>
        qb
            .select({
                integrationId: webhookHandleDetails.integrationId,
                handleId: webhookHandleDetails.handleId,
                url: onlyFor(webhookHandleDetails.integrationId, 'admin', webhookHandleDetails.url),
            })
            .from(webhookHandleDetails)
            .where(rowsFor(webhookHandleDetails.integrationId, 'viewer')),
    );

export const slackHandleDetailsView = gitgazerSchema
    .view('slack_handle_details_view')
    .with({securityBarrier: true})
    .as((qb) =>
        qb
            .select({
                integrationId: slackHandleDetails.integrationId,
                handleId: slackHandleDetails.handleId,
                channelId: slackHandleDetails.channelId,
                channelName: slackHandleDetails.channelName,
            })
            .from(slackHandleDetails)
            .where(rowsFor(slackHandleDetails.integrationId, 'viewer')),
    );

export const notificationRulesView = gitgazerSchema
    .view('notification_rules_view')
    .with({securityBarrier: true})
    .as((qb) =>
        qb
            .select({
                integrationId: notificationRules.integrationId,
                id: notificationRules.id,
                label: notificationRules.label,
                enabled: notificationRules.enabled,
                ignoreDependabot: notificationRules.ignore_dependabot,
                includeLogDetails: notificationRules.include_log_details,
                rule: notificationRules.rule,
                createdAt: notificationRules.createdAt,
                updatedAt: notificationRules.updatedAt,
            })
            .from(notificationRules)
            .where(rowsFor(notificationRules.integrationId, 'viewer')),
    );

export const notificationRuleDestinationsView = gitgazerSchema
    .view('notification_rule_destinations_view')
    .with({securityBarrier: true})
    .as((qb) =>
        qb
            .select({
                integrationId: notificationRuleDestinations.integrationId,
                ruleId: notificationRuleDestinations.ruleId,
                handleId: notificationRuleDestinations.handleId,
            })
            .from(notificationRuleDestinations)
            .where(rowsFor(notificationRuleDestinations.integrationId, 'viewer')),
    );

export const integrationInvitationsView = gitgazerSchema
    .view('integration_invitations_view')
    .with({securityBarrier: true})
    .as((qb) =>
        qb
            .select({
                integrationId: integrationInvitations.integrationId,
                id: integrationInvitations.id,
                email: onlyFor(integrationInvitations.integrationId, 'admin', integrationInvitations.email),
                role: integrationInvitations.role,
                invitedBy: integrationInvitations.invitedBy,
                inviteeId: integrationInvitations.inviteeId,
                inviteToken: onlyFor(integrationInvitations.integrationId, 'admin', integrationInvitations.inviteToken),
                status: integrationInvitations.status,
                createdAt: integrationInvitations.createdAt,
                expiresAt: integrationInvitations.expiresAt,
            })
            .from(integrationInvitations)
            .where(and(ne(integrationInvitations.status, 'accepted'), rowsFor(integrationInvitations.integrationId, 'member'))),
    );

export const eventLogEntriesView = gitgazerSchema
    .view('event_log_entries_view')
    .with({securityBarrier: true})
    .as((qb) =>
        qb
            .select({
                integrationId: eventLogEntries.integrationId,
                id: eventLogEntries.id,
                category: eventLogEntries.category,
                type: eventLogEntries.type,
                title: eventLogEntries.title,
                message: eventLogEntries.message,
                metadata: eventLogEntries.metadata,
                read: eventLogEntries.read,
                createdAt: eventLogEntries.createdAt,
            })
            .from(eventLogEntries)
            .where(rowsFor(eventLogEntries.integrationId, 'viewer')),
    );

export const userAssignmentsView = githubSchema
    .view('user_assignments_view')
    .with({securityBarrier: true})
    .as((qb) =>
        qb
            .select({
                integrationId: userAssignments.integrationId,
                userId: userAssignments.userId,
                role: userAssignments.role,
                source: userAssignments.source,
                createdAt: userAssignments.createdAt,
            })
            .from(userAssignments)
            .where(rowsFor(userAssignments.integrationId, 'viewer')),
    );

export const usersView = gitgazerSchema
    .view('users_view')
    .with({securityBarrier: true})
    .as((qb) =>
        qb
            .select({
                id: users.id,
                email: sql<string | null>`CASE WHEN ${visibleUsers(qb, 'admin', 'admin')} THEN ${users.email} END`.as('email'),
                name: users.name,
                picture: users.picture,
                githubLogin: users.githubLogin,
                lastActiveAt: users.lastActiveAt,
            })
            .from(users)
            .where(visibleUsers(qb, 'viewer', 'member')),
    );

export const slackWorkspacesView = gitgazerSchema
    .view('slack_workspaces_view')
    .with({securityBarrier: true})
    .as((qb) =>
        qb
            .select({
                teamId: slackWorkspaces.teamId,
                teamName: slackWorkspaces.teamName,
                botUserId: slackWorkspaces.botUserId,
                installedBy: sql<
                    number | null
                >`CASE WHEN ${inArray(slackWorkspaces.installedBy, usersFor(qb, 'viewer'))} THEN ${slackWorkspaces.installedBy} END`.as(
                    'installed_by',
                ),
                installedAt: slackWorkspaces.installedAt,
                disconnectedAt: slackWorkspaces.disconnectedAt,
            })
            .from(slackWorkspaces)
            .where(
                inArray(
                    slackWorkspaces.teamId,
                    qb
                        .select({teamId: integrationAppSlackSettings.teamId})
                        .from(integrationAppSlackSettings)
                        .where(rowsFor(integrationAppSlackSettings.integrationId, 'viewer')),
                ),
            ),
    );
