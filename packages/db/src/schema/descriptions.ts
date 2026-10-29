import {Column, getColumns, getTableName, getTableSchema, is, isView, SQL, type Table, type View} from 'drizzle-orm';
import {escapeIdentifier, escapeLiteral} from 'pg';
import {
    enterprises,
    events,
    githubAppInstallations,
    githubAppWebhooks,
    githubOrgMembers,
    integrations,
    organizations,
    pendingOrgSync,
    pullRequestReviews,
    pullRequests,
    repositories,
    user,
    userAssignments,
    workflowJobs,
    workflowRunPullRequests,
    workflowRuns,
} from './github';
import {
    eventLogEntriesView,
    integrationAppGithubSettingsView,
    integrationAppSlackSettingsView,
    integrationAppsView,
    integrationInvitationsView,
    notificationHandlesView,
    notificationRuleDestinationsView,
    notificationRulesView,
    slackHandleDetailsView,
    slackWorkspacesView,
    userAssignmentsView,
    usersView,
    webhookHandleDetailsView,
} from './views';

type Fields<T> = T extends Table ? T['_']['columns'] : T extends View ? T['_']['selectedFields'] : never;

export type Description = {object: Table | View; text: string; columns: Record<string, string>};

export const describe = <T extends Table | View>(object: T, text: string, columns: Partial<Record<keyof Fields<T>, string>> = {}): Description => ({
    object,
    text,
    columns: columns as Record<string, string>,
});

const tenantKey = 'Tenant key. Ids are unique only per integration, so join on integration_id together with the id column.';
const githubUserRef = (who: string) => `${who}: github."user".id, joined together with integration_id.`;
const adminOnly = 'NULL unless you are admin or owner of the integration.';

export const descriptions: Description[] = [
    describe(integrations, 'A GitGazer integration, the tenant every GitHub row belongs to.', {
        integrationId: tenantKey,
        ownerId: 'GitGazer user who owns the integration: gitgazer.users_view.id, not a GitHub user id.',
    }),
    describe(userAssignments, "GitGazer users' roles per integration. Query github.user_assignments_view instead."),
    describe(events, 'Raw GitHub webhook payloads as received, before they are imported into the other tables.'),
    describe(enterprises, 'GitHub enterprises seen in webhooks.'),
    describe(organizations, 'GitHub organizations seen in webhooks.', {
        enterpriseId: 'github.enterprises.id, joined together with integration_id; NULL outside an enterprise.',
    }),
    describe(repositories, 'GitHub repositories seen in webhooks.', {
        integrationId: tenantKey,
        name: 'Repository name without the owner.',
        organizationId: 'github.organizations.id, joined together with integration_id; NULL for repositories owned by a user.',
        ownerId: githubUserRef('Owning account'),
        topics: 'JSON array of the GitHub topics.',
    }),
    describe(
        user,
        'GitHub accounts (people, bots, organizations) that appear as actors, authors, reviewers or owners. GitGazer users are in gitgazer.users_view.',
        {
            id: 'GitHub account id, referenced by the actor_id, sender_id, author_id, user_id and owner_id columns of the other github tables.',
            type: 'User, Bot or Organization.',
        },
    ),
    describe(workflowRuns, 'GitHub Actions workflow runs. A re-run keeps the run id, so each row holds the latest attempt.', {
        integrationId: tenantKey,
        id: 'GitHub run id; github.workflow_jobs.workflow_run_id points here.',
        actorId: githubUserRef('Account that triggered the run'),
        event: 'Trigger, such as push, pull_request, pull_request_target, schedule, workflow_dispatch or dynamic (runs GitHub starts itself, such as Dependabot or code scanning).',
        status: 'queued, in_progress, waiting or completed. Only completed runs have a conclusion.',
        conclusion:
            'Outcome once status is completed: success, failure, cancelled, skipped, startup_failure, action_required, neutral, timed_out or stale. NULL while the run is not completed.',
        name: 'Workflow name at the time of the run.',
        workflowId: 'GitHub id of the workflow definition. Groups the runs of one workflow even after it is renamed.',
        runAttempt: 'Attempt number of the latest attempt, starting at 1.',
        createdAt: 'When the first attempt was created.',
        runStartedAt: 'When the latest attempt started, in UTC (timestamp without time zone).',
        updatedAt: 'Last change reported by GitHub; for a completed run, roughly when it finished.',
        headBranch: 'Branch the run ran on; NULL for some events.',
    }),
    describe(workflowJobs, 'GitHub Actions jobs. Every attempt of a run gets its own job rows.', {
        integrationId: tenantKey,
        workflowRunId: 'github.workflow_runs.id, joined together with integration_id.',
        runId: 'Same value as workflow_run_id.',
        runAttempt: 'Attempt of the run this job belongs to, starting at 1.',
        senderId: githubUserRef('Account that caused the webhook event'),
        status: 'queued, in_progress, waiting or completed. Only completed jobs have a conclusion.',
        conclusion: 'Outcome once status is completed: success, failure, cancelled or skipped. NULL while the job is not completed.',
        createdAt: 'When the job was queued; started_at - created_at is the queue time.',
        completedAt: 'NULL until the job finishes; completed_at - started_at is the run time.',
        workflowName: 'Name of the workflow the job belongs to.',
    }),
    describe(pullRequests, 'GitHub pull requests.', {
        integrationId: tenantKey,
        id: 'GitHub pull request id, not the number shown in GitHub.',
        number: 'Pull request number shown in GitHub, unique per repository.',
        state: 'open or closed. A merged pull request is closed with merged = true.',
        merged: 'true once merged; NULL if GitHub did not report it.',
        authorId: githubUserRef('Author'),
        additions: 'As of the latest event; 0 when GitHub did not report it.',
        deletions: 'As of the latest event; 0 when GitHub did not report it.',
        changedFiles: 'As of the latest event; 0 when GitHub did not report it.',
        commits: 'As of the latest event; 0 when GitHub did not report it.',
    }),
    describe(pullRequestReviews, 'Pull request reviews.', {
        pullRequestId: 'github.pull_requests.id (not the number), joined together with integration_id.',
        userId: `${githubUserRef('Reviewer')} NULL if the account was deleted.`,
        state: 'approved, changes_requested, commented or dismissed.',
    }),
    describe(
        workflowRunPullRequests,
        'Links workflow runs to the pull requests they ran for. A pull_request_id can be missing from github.pull_requests when no pull request event was received.',
        {pullRequestId: 'github.pull_requests.id (not the number), joined together with integration_id.'},
    ),
    describe(githubAppInstallations, 'GitHub App installations linked to an integration.', {
        accountType: 'Organization or User the app is installed on.',
        repositorySelection: 'all or selected.',
        webhookEvents: 'JSON array of the webhook events the installation subscribes to.',
    }),
    describe(githubAppWebhooks, 'Webhooks registered on GitHub organizations or repositories for an App installation.'),
    describe(githubOrgMembers, 'GitHub organization members per App installation, as of the last org sync.', {
        role: 'GitHub organization role: admin or member.',
    }),
    describe(
        pendingOrgSync,
        'GitHub organization members without a GitGazer account yet; the stored role is assigned once they sign in with that GitHub account.',
    ),

    describe(integrationAppsView, 'Apps connected to each integration, at most one per type.', {
        type: 'github, webhook or slack.',
    }),
    describe(integrationAppGithubSettingsView, 'Settings of the GitHub app of an integration.', {
        secret: `Webhook secret; ${adminOnly}`,
        orgSyncDefaultRole: 'Role GitHub organization members get when they are synced: viewer, member or admin.',
    }),
    describe(integrationAppSlackSettingsView, 'Slack workspace connected to an integration.', {
        teamId: 'gitgazer.slack_workspaces_view.team_id.',
    }),
    describe(
        notificationHandlesView,
        'Notification destinations: a webhook URL or a Slack channel, detailed in webhook_handle_details_view or slack_handle_details_view by integration_id and handle_id.',
        {appId: 'gitgazer.integration_apps_view.app_id; its type says whether this is a webhook or Slack handle.'},
    ),
    describe(webhookHandleDetailsView, 'Webhook URL of a notification handle.', {url: adminOnly}),
    describe(slackHandleDetailsView, 'Slack channel of a notification handle.'),
    describe(
        notificationRulesView,
        'Rules that pick which workflow job alerts are sent. The destinations are in notification_rule_destinations_view.',
        {
            rule: 'JSON filter. owner, repository_name, workflow_name and head_branch must match exactly, an empty or missing value matches anything; topics matches repositories with at least one of the topics.',
            ignoreDependabot: 'Skip runs triggered by Dependabot.',
            includeLogDetails: 'Include the failed job log excerpt in the alert.',
        },
    ),
    describe(notificationRuleDestinationsView, 'The notification handles each rule sends to.'),
    describe(
        integrationInvitationsView,
        'Pending and expired invitations to an integration; accepted ones are hidden. Only members and above see rows.',
        {
            email: adminOnly,
            inviteToken: adminOnly,
            invitedBy: 'gitgazer.users_view.id.',
            inviteeId: 'gitgazer.users_view.id of the invited user, once known.',
            status: 'pending or expired.',
        },
    ),
    describe(eventLogEntriesView, 'GitGazer event log: sent notifications and integration events.', {
        category: 'notification or integration.',
        type: 'failure, success, warning, info or alert.',
        read: 'Marked as read in the GitGazer UI, shared by all users of the integration.',
    }),
    describe(userAssignmentsView, "GitGazer users' roles per integration.", {
        userId: 'gitgazer.users_view.id, not a GitHub user id.',
        role: 'owner, admin, member or viewer.',
        source: 'manual (invited or added in GitGazer) or org_sync (synced from a GitHub organization).',
    }),
    describe(
        usersView,
        'GitGazer users who share an integration with you, or invited or were invited to one (open invitations, member+). Global: no integration_id.',
        {
            email: 'NULL unless you are admin or owner of an integration the user belongs to or has an open invitation in.',
            lastActiveAt: 'NULL unless the user shares an integration with you.',
            githubLogin: 'Linked GitHub login, matches github."user".login; NULL if not linked.',
        },
    ),
    describe(slackWorkspacesView, 'Slack workspaces connected to your integrations. Global: no integration_id.', {
        installedBy: 'gitgazer.users_view.id; NULL if that user shares no integration with you.',
        disconnectedAt: 'NULL while the workspace is connected.',
    }),
];

const columnName = (field: unknown): string => {
    if (is(field, Column)) return field.name;
    if (is(field, SQL.Aliased)) return field.fieldAlias;
    throw new Error('Only columns and aliased fields can be described');
};

/** COMMENT ON statements for the descriptions; idempotent, so they can run after every migration. */
export const descriptionStatements = (entries = descriptions): string[] =>
    entries.flatMap(({object, text, columns}) => {
        const target = `${escapeIdentifier(getTableSchema(object) ?? 'public')}.${escapeIdentifier(getTableName(object))}`;
        const fields: Record<string, unknown> = getColumns(object);
        return [
            `COMMENT ON ${isView(object) ? 'VIEW' : 'TABLE'} ${target} IS ${escapeLiteral(text)}`,
            ...Object.entries(columns).map(
                ([key, columnText]) => `COMMENT ON COLUMN ${target}.${escapeIdentifier(columnName(fields[key]))} IS ${escapeLiteral(columnText)}`,
            ),
        ];
    });
