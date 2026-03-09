import {RdsTransaction} from '@gitgazer/db/client';
import {enterprises, organizations, repositories, user} from '@gitgazer/db/schema/github/workflows';
import {WorkflowJobEvent, WorkflowRunEvent} from '@gitgazer/db/types';
import {InferSelectModel} from 'drizzle-orm';

export const importWorkflow = async (
    integrationId: string,
    event: WorkflowJobEvent | WorkflowRunEvent,
    tx: RdsTransaction,
): Promise<{
    enterprise?: InferSelectModel<typeof enterprises>;
    organization?: InferSelectModel<typeof organizations>;
    owner: InferSelectModel<typeof user>;
    repository: InferSelectModel<typeof repositories>;
    sender: InferSelectModel<typeof user>;
}> => {
    // Insert/Update Enterprise (if present)
    let enterpriseId: number | null = null;
    let enterprise: InferSelectModel<typeof enterprises>[] = [];
    if ('enterprise' in event && event.enterprise) {
        const ep = event.enterprise as any;
        enterpriseId = ep.id;
        enterprise = await tx
            .insert(enterprises)
            .values({
                integrationId,
                id: enterpriseId,
                name: ep.name,
            })
            .onConflictDoUpdate({
                target: [enterprises.integrationId, enterprises.id],
                set: {
                    name: ep.name,
                },
            })
            .returning();
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
            .onConflictDoUpdate({
                target: [organizations.integrationId, organizations.id],
                set: {
                    login: event.organization.login,
                    description: event.organization.description,
                },
            })
            .returning();
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
        .onConflictDoUpdate({
            target: [user.integrationId, user.id],
            set: {
                login: event.repository.owner.login,
                type: event.repository.owner.type,
            },
        })
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
        .onConflictDoUpdate({
            target: [user.integrationId, user.id],
            set: {
                login: event.sender.login,
                type: event.sender.type,
            },
        })
        .returning();

    return {enterprise: enterprise[0], organization: organization[0], owner: owner[0], repository: repository[0], sender: sender[0]};
};
