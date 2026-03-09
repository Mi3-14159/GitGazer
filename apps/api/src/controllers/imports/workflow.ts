import {RdsTransaction} from '@gitgazer/db/client';
import {enterprises, organizations, repositories, user} from '@gitgazer/db/schema/github/workflows';
import {WorkflowJobEvent, WorkflowRunEvent} from '@gitgazer/db/types';
import {InferSelectModel} from 'drizzle-orm';

export const importWorkflow = async (
    integrationId: string,
    event: WorkflowJobEvent | WorkflowRunEvent,
    tx: RdsTransaction,
): Promise<{
    owner: InferSelectModel<typeof user>;
    repository: InferSelectModel<typeof repositories>;
    sender: InferSelectModel<typeof user>;
    organization: InferSelectModel<typeof organizations> | null;
}> => {
    // Insert/Update Enterprise (if present)
    let enterpriseId: number | null = null;
    if ('enterprise' in event && event.enterprise) {
        const enterprise = event.enterprise as any;
        enterpriseId = enterprise.id;
        await tx
            .insert(enterprises)
            .values({
                integrationId,
                id: enterpriseId,
                name: enterprise.name,
            })
            .onConflictDoNothing()
            .returning();
    }

    // Insert/Update Organization (if present)
    let organizationId: number | null = null;
    let organization: InferSelectModel<typeof organizations> | null = null;
    if (event.organization) {
        organizationId = event.organization.id;
        const orga = await tx
            .insert(organizations)
            .values({
                integrationId,
                id: organizationId,
                enterpriseId: enterpriseId,
                login: event.organization.login,
                description: event.organization.description ?? null,
            })
            .onConflictDoNothing()
            .returning();
        organization = orga[0];
    }

    // Insert/Update Repository
    const owner = await tx
        .insert(user)
        .values({
            integrationId,
            id: event.repository.owner.id,
            login: event.repository.owner.login,
            type: event.repository.owner.type,
        })
        .onConflictDoNothing()
        .returning();

    const repository = await tx
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
        .onConflictDoUpdate({
            target: [repositories.integrationId, repositories.id],
            set: {
                name: event.repository.name,
                private: event.repository.private,
                updatedAt: new Date(event.repository.updated_at),
                ownerId: event.repository.owner.id,
            },
        })
        .returning();

    const sender = await tx
        .insert(user)
        .values({
            integrationId,
            id: event.sender.id,
            login: event.sender.login,
            type: event.sender.type,
        })
        .onConflictDoNothing()
        .returning();

    return {owner: owner[0], repository: repository[0], sender: sender[0], organization};
};
