import {RdsTransaction} from '@gitgazer/db/client';
import {enterprises, organizations, pullRequests, repositories, user} from '@gitgazer/db/schema/github/workflows';
import {PullRequestEvent} from '@gitgazer/db/types';
import {eq} from 'drizzle-orm';
import {InferSelectModel} from 'drizzle-orm/table';

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
    // Insert/Update Enterprise (if present)
    let enterpriseId: number | null = null;
    let enterprise: InferSelectModel<typeof enterprises>[] = [];
    if ('enterprise' in event && event.enterprise) {
        const ep = event.enterprise as any;
        enterpriseId = ep.id;
        if (!enterpriseId) {
            throw new Error('Enterprise ID is missing in the event payload');
        }
        enterprise = await tx
            .insert(enterprises)
            .values({
                integrationId,
                id: enterpriseId,
                name: ep.name,
            })
            .onConflictDoNothing()
            .returning();
        if (enterprise.length === 0) {
            // Enterprise already exists, fetch it to get its data
            enterprise = await tx.select().from(enterprises).where(eq(enterprises.id, enterpriseId!)).limit(1);
            if (enterprise.length === 0) {
                throw new Error(`Failed to insert or find enterprise with id ${enterpriseId}`);
            }
        }
    }

    // Insert/Update Organization (if present)
    let organizationId: number | null = null;
    let organization: InferSelectModel<typeof organizations>[] = [];
    if (event.organization) {
        organizationId = event.organization.id;
        organization = await tx
            .insert(organizations)
            .values({
                integrationId,
                id: organizationId,
                enterpriseId: enterpriseId,
                login: event.organization.login,
                description: event.organization.description,
            })
            .onConflictDoNothing()
            .returning();
        if (organization.length === 0) {
            // Organization already exists, fetch it to get its data
            organization = await tx.select().from(organizations).where(eq(organizations.id, organizationId!)).limit(1);
            if (organization.length === 0) {
                throw new Error(`Failed to insert or find organization with id ${organizationId}`);
            }
        }
    }

    // Insert/Update Repository
    let repository = await tx
        .insert(repositories)
        .values({
            integrationId,
            id: event.repository.id,
            organizationId: organizationId,
            name: event.repository.name,
            private: event.repository.private,
            createdAt: new Date(event.repository.created_at),
            updatedAt: new Date(event.repository.updated_at),
            ownerId: event.repository.owner.id,
        })
        .onConflictDoNothing()
        .returning();

    if (repository.length === 0) {
        // Repository already exists, fetch it to get its data
        repository = await tx.select().from(repositories).where(eq(repositories.id, event.repository.id)).limit(1);
        if (repository.length === 0) {
            throw new Error(`Failed to insert or find repository with id ${event.repository.id}`);
        }
    }

    // Insert/Update Users in bulk
    let usr = await tx
        .insert(user)
        .values({
            integrationId,
            id: event.pull_request.user.id,
            login: event.pull_request.user.login,
            type: event.pull_request.user.type,
        })
        .onConflictDoNothing()
        .returning();

    if (usr.length === 0) {
        // If some users were not inserted, it means they already exist. Fetch them to get their data.
        usr = await tx.select().from(user).where(eq(user.id, event.pull_request.user.id));
        if (usr.length === 0) {
            throw new Error(`Failed to insert or find user with id ${event.pull_request.user.id}`);
        }
    }

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
        user: usr[0],
        pullRequest: result[0],
    };
};
