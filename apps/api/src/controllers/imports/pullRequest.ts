import {RdsTransaction} from '@gitgazer/db/client';
import {organizations, pullRequests, repositories, user} from '@gitgazer/db/schema/github/workflows';
import {PullRequestEvent} from '@gitgazer/db/types';
import {InferSelectModel} from 'drizzle-orm/table';

export const importPullRequest = async (
    integrationId: string,
    event: PullRequestEvent,
    tx: RdsTransaction,
): Promise<InferSelectModel<typeof pullRequests>> => {
    const {pull_request, repository, organization} = event;

    // Upsert organization if present
    if (organization) {
        await tx
            .insert(organizations)
            .values({
                integrationId,
                id: organization.id,
                login: organization.login,
                description: 'description' in organization ? (organization.description as string | null) : null,
            })
            .onConflictDoNothing();
    }

    // Upsert repository owner
    await tx
        .insert(user)
        .values({
            integrationId,
            id: repository.owner.id,
            login: repository.owner.login,
            type: repository.owner.type,
        })
        .onConflictDoNothing();

    // Upsert repository
    await tx
        .insert(repositories)
        .values({
            integrationId,
            id: repository.id,
            name: repository.name,
            private: repository.private,
            organizationId: organization?.id ?? null,
            ownerId: repository.owner.id,
            createdAt: new Date(repository.created_at),
            updatedAt: new Date(repository.updated_at),
        })
        .onConflictDoNothing();

    // Upsert PR author
    await tx
        .insert(user)
        .values({
            integrationId,
            id: pull_request.user.id,
            login: pull_request.user.login,
            type: pull_request.user.type,
        })
        .onConflictDoNothing();

    // Insert/update pull request
    const result = await tx
        .insert(pullRequests)
        .values({
            integrationId,
            repositoryId: repository.id,
            id: pull_request.id,
            number: pull_request.number,
            state: pull_request.state,
            title: pull_request.title,
            body: pull_request.body ?? null,
            headBranch: pull_request.head.ref,
            baseBranch: pull_request.base.ref,
            authorId: pull_request.user.id,
            draft: pull_request.draft,
            merged: pull_request.merged ?? null,
            createdAt: new Date(pull_request.created_at),
            updatedAt: new Date(pull_request.updated_at),
            closedAt: pull_request.closed_at ? new Date(pull_request.closed_at) : null,
            mergedAt: pull_request.merged_at ? new Date(pull_request.merged_at) : null,
        })
        .onConflictDoUpdate({
            target: [pullRequests.integrationId, pullRequests.id],
            set: {
                state: pull_request.state,
                title: pull_request.title,
                body: pull_request.body ?? null,
                draft: pull_request.draft,
                merged: pull_request.merged ?? null,
                updatedAt: new Date(pull_request.updated_at),
                closedAt: pull_request.closed_at ? new Date(pull_request.closed_at) : null,
                mergedAt: pull_request.merged_at ? new Date(pull_request.merged_at) : null,
            },
        })
        .returning();

    return result[0];
};
