import {RdsTransaction} from '@gitgazer/db/client';
import {enterprises, organizations, pullRequests, user} from '@gitgazer/db/schema/github/workflows';
import {PullRequestEvent} from '@gitgazer/db/types';
import {InferSelectModel} from 'drizzle-orm/table';
import {upsertEnterprise, upsertOrganization, upsertRepository, upsertUsers} from './shared';

export const importPullRequest = async (
    integrationId: string,
    event: PullRequestEvent,
    tx: RdsTransaction,
): Promise<{
    enterprise: InferSelectModel<typeof enterprises>;
    organization: InferSelectModel<typeof organizations>;
    user: InferSelectModel<typeof user>;
    pullRequest: InferSelectModel<typeof pullRequests>;
}> => {
    const enterprisePayload =
        'enterprise' in event && event.enterprise ? {id: (event.enterprise as any).id, name: (event.enterprise as any).name} : undefined;
    const {enterprise, enterpriseId} = await upsertEnterprise(tx, integrationId, enterprisePayload);

    const orgPayload = event.organization
        ? {id: event.organization.id, login: event.organization.login, description: event.organization.description}
        : undefined;
    const {organization, organizationId} = await upsertOrganization(tx, integrationId, enterpriseId, orgPayload);

    await upsertRepository(tx, integrationId, organizationId, {
        id: event.repository.id,
        name: event.repository.name,
        private: event.repository.private,
        created_at: event.repository.created_at,
        updated_at: event.repository.updated_at,
        owner: event.repository.owner,
        defaultBranch: event.repository.default_branch,
    });

    const userMap = await upsertUsers(tx, integrationId, [
        {id: event.repository.owner.id, login: event.repository.owner.login, type: event.repository.owner.type},
        {id: event.pull_request.user.id, login: event.pull_request.user.login, type: event.pull_request.user.type},
    ]);

    // Insert/update pull request
    const result = await tx
        .insert(pullRequests)
        .values({
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
        })
        .onConflictDoUpdate({
            target: [pullRequests.integrationId, pullRequests.id],
            set: {
                state: event.pull_request.state,
                title: event.pull_request.title,
                body: event.pull_request.body ?? null,
                draft: event.pull_request.draft,
                merged: event.pull_request.merged ?? null,
                updatedAt: new Date(event.pull_request.updated_at),
                closedAt: event.pull_request.closed_at ? new Date(event.pull_request.closed_at) : null,
                mergedAt: event.pull_request.merged_at ? new Date(event.pull_request.merged_at) : null,
            },
        })
        .returning();

    return {
        enterprise: enterprise[0],
        organization: organization[0],
        user: userMap.get(event.pull_request.user.id)!,
        pullRequest: result[0],
    };
};
