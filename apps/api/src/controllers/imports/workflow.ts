import {RdsTransaction} from '@gitgazer/db/client';
import {enterprises, organizations, repositories} from '@gitgazer/db/schema/github/workflows';
import {WorkflowJobEvent, WorkflowRunEvent} from '@gitgazer/db/types';
import {eq, InferSelectModel} from 'drizzle-orm';

export const importWorkflow = async (
    integrationId: string,
    event: WorkflowJobEvent | WorkflowRunEvent,
    tx: RdsTransaction,
): Promise<{
    enterprise: InferSelectModel<typeof enterprises>;
    organization: InferSelectModel<typeof organizations>;
    repository: InferSelectModel<typeof repositories>;
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

    return {enterprise: enterprise[0], organization: organization[0], repository: repository[0]};
};
