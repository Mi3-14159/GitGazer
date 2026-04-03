import {upsertEnterprises, upsertOrganizations, upsertPullRequests, upsertRepositories, upsertUsers} from '@/domains/webhooks/importers/shared';
import {isEnterprise} from '@/domains/webhooks/importers/types';
import {RdsTransaction} from '@gitgazer/db/client';
import {EnterpriseSelect, OrganizationSelect, PullRequest, PullRequestEvent, UserSelect} from '@gitgazer/db/types';

export const importPullRequest = async (
    integrationId: string,
    event: PullRequestEvent,
    tx: RdsTransaction,
): Promise<{
    enterprise?: EnterpriseSelect;
    organization?: OrganizationSelect;
    user: UserSelect;
    pullRequest: PullRequest;
}> => {
    let enterprise: EnterpriseSelect | undefined = undefined;
    if ('enterprise' in event && event.enterprise && isEnterprise(event.enterprise)) {
        const result = await upsertEnterprises(tx, [
            {
                name: event.enterprise.name,
                id: event.enterprise.id,
                integrationId,
            },
        ]);
        enterprise = result.enterprises[0];
    }

    let organization: OrganizationSelect | undefined = undefined;
    if (event.organization) {
        const result = await upsertOrganizations(tx, [
            {
                id: event.organization.id,
                login: event.organization.login,
                description: event.organization.description,
                integrationId,
                enterpriseId: enterprise?.id,
            },
        ]);

        organization = result.organizations[0];
    }

    await upsertRepositories(tx, [
        {
            integrationId,
            organizationId: organization?.id,
            id: event.repository.id,
            name: event.repository.name,
            private: event.repository.private,
            createdAt: new Date(event.repository.created_at),
            updatedAt: new Date(event.repository.updated_at),
            ownerId: event.repository.owner.id,
            defaultBranch: event.repository.default_branch,
            topics: event.repository.topics,
        },
    ]);

    const {users} = await upsertUsers(tx, [
        {integrationId, id: event.repository.owner.id, login: event.repository.owner.login, type: event.repository.owner.type},
        {integrationId, id: event.pull_request.user.id, login: event.pull_request.user.login, type: event.pull_request.user.type},
    ]);

    const {pullRequests} = await upsertPullRequests(tx, [
        {
            integrationId,
            repositoryId: event.repository.id,
            id: event.pull_request.id,
            number: event.pull_request.number,
            state: event.pull_request.state,
            title: event.pull_request.title,
            body: event.pull_request.body ?? null,
            headBranch: event.pull_request.head.ref,
            baseBranch: event.pull_request.base.ref,
            authorId: event.pull_request.user.id,
            draft: event.pull_request.draft,
            merged: event.pull_request.merged ?? null,
            createdAt: new Date(event.pull_request.created_at),
            updatedAt: new Date(event.pull_request.updated_at),
            closedAt: event.pull_request.closed_at ? new Date(event.pull_request.closed_at) : null,
            mergedAt: event.pull_request.merged_at ? new Date(event.pull_request.merged_at) : null,
            additions: event.pull_request.additions,
            deletions: event.pull_request.deletions,
            changedFiles: event.pull_request.changed_files,
            commits: event.pull_request.commits,
        },
    ]);

    return {
        enterprise,
        organization,
        user: users.find((user) => user.id === event.pull_request.user.id)!,
        pullRequest: pullRequests[0],
    };
};
