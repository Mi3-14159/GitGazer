import {RdsTransaction} from '@gitgazer/db/client';
import {enterprises, organizations, repositories, user} from '@gitgazer/db/schema/github/workflows';
import {RepositoryInsert} from '@gitgazer/db/types';
import {eq, inArray, InferSelectModel, lt} from 'drizzle-orm';

type EnterprisePayload = {id: number; name: string};
type OrganizationPayload = {id: number; login: string; description: string | null};
type UserPayload = {id: number; login: string; type: string};

/**
 * Upsert an enterprise record. Returns the enterprise row and its ID.
 */
export const upsertEnterprise = async (
    tx: RdsTransaction,
    integrationId: string,
    payload: EnterprisePayload | undefined,
): Promise<{enterprise: InferSelectModel<typeof enterprises>[]; enterpriseId: number | null}> => {
    if (!payload) {
        return {enterprise: [], enterpriseId: null};
    }

    const enterpriseId = payload.id;
    if (!enterpriseId) {
        throw new Error('Enterprise ID is missing in the event payload');
    }

    let enterprise = await tx.insert(enterprises).values({integrationId, id: enterpriseId, name: payload.name}).onConflictDoNothing().returning();

    if (enterprise.length === 0) {
        enterprise = await tx.select().from(enterprises).where(eq(enterprises.id, enterpriseId)).limit(1);
        if (enterprise.length === 0) {
            throw new Error(`Failed to insert or find enterprise with id ${enterpriseId}`);
        }
    }

    return {enterprise, enterpriseId};
};

/**
 * Upsert an organization record. Returns the organization row and its ID.
 */
export const upsertOrganization = async (
    tx: RdsTransaction,
    integrationId: string,
    enterpriseId: number | null,
    payload: OrganizationPayload | undefined,
): Promise<{organization: InferSelectModel<typeof organizations>[]; organizationId: number | null}> => {
    if (!payload) {
        return {organization: [], organizationId: null};
    }

    const organizationId = payload.id;
    let organization = await tx
        .insert(organizations)
        .values({
            integrationId,
            id: organizationId,
            enterpriseId,
            login: payload.login,
            description: payload.description,
        })
        .onConflictDoNothing()
        .returning();

    if (organization.length === 0) {
        organization = await tx.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
        if (organization.length === 0) {
            throw new Error(`Failed to insert or find organization with id ${organizationId}`);
        }
    }

    return {organization, organizationId};
};

/**
 * Upsert a repository record.
 */
export const upsertRepository = async (tx: RdsTransaction, payload: RepositoryInsert): Promise<InferSelectModel<typeof repositories>> => {
    let repository = await tx
        .insert(repositories)
        .values(payload)
        .onConflictDoUpdate({
            target: [repositories.integrationId, repositories.id],
            set: {
                name: payload.name,
                updatedAt: payload.updatedAt,
                private: payload.private,
                ownerId: payload.ownerId,
                defaultBranch: payload.defaultBranch,
                topics: payload.topics,
            },
            setWhere: lt(repositories.updatedAt, payload.updatedAt),
        })
        .returning();

    if (repository.length === 0) {
        repository = await tx.select().from(repositories).where(eq(repositories.id, payload.id)).limit(1);
        if (repository.length === 0) {
            throw new Error(`Failed to insert or find repository with id ${payload.id}`);
        }
    }

    return repository[0];
};

/**
 * Bulk upsert users: insert new users, fetch existing ones, and return
 * a resolved map of userId → user row.
 */
export const upsertUsers = async (
    tx: RdsTransaction,
    integrationId: string,
    userPayloads: UserPayload[],
): Promise<Map<number, InferSelectModel<typeof user>>> => {
    const userMap = new Map<number, InferSelectModel<typeof user>>();
    for (const u of userPayloads) {
        userMap.set(u.id, {integrationId, id: u.id, login: u.login, type: u.type});
    }

    const inserted = await tx.insert(user).values(Array.from(userMap.values())).onConflictDoNothing().returning();

    if (inserted.length < userMap.size) {
        // Some users already existed — fetch all to get actual DB rows
        const existingUsers = await tx
            .select()
            .from(user)
            .where(inArray(user.id, Array.from(userMap.keys())));

        for (const u of existingUsers) {
            userMap.set(u.id, u);
        }
    }

    return userMap;
};
