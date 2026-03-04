import {db, withRlsTransaction} from '@/clients/rds';
import {Integration} from '@/common/types';
import {integrations, userAssignments} from '@/drizzle/schema/github/workflows';
import {getLogger} from '@/logger';
import {BadRequestError, ForbiddenError, InternalServerError, UnauthorizedError} from '@aws-lambda-powertools/event-handler/http';
import {and, eq} from 'drizzle-orm';

export const getIntegrations = async (params: {integrationIds: string[]}): Promise<Integration[]> => {
    const logger = getLogger();
    const {integrationIds} = params;

    logger.info(`Getting integrations: ${integrationIds.join(', ')}`, {integrationIds});
    if (integrationIds.length === 0) {
        return [];
    }

    const results = await withRlsTransaction(integrationIds, async (tx) => {
        return await tx.select().from(integrations);
    });

    return results.map((r) => ({
        id: r.integrationId,
        label: r.label,
        owner: r.ownerId,
        secret: r.secret,
    }));
};

export const upsertIntegration = async (params: {id?: string; label?: string; userId?: number; integrationIds: string[]}): Promise<Integration> => {
    const logger = getLogger();
    const {id, label, userId, integrationIds} = params;

    if (id) {
        logger.info(`Updating integration ${id} with label: ${label}`);

        if (!label) {
            throw new BadRequestError('Missing label for integration update');
        }

        // Use RLS to ensure only accessible integrations can be updated
        const results = await withRlsTransaction(integrationIds, async (tx) => {
            return await tx.update(integrations).set({label}).where(eq(integrations.integrationId, id)).returning();
        });

        if (results.length === 0) {
            throw new UnauthorizedError('Integration not found or access denied');
        }

        const result = results[0];
        return {
            id: result.integrationId,
            label: result.label,
            owner: result.ownerId,
            secret: result.secret,
        };
    }

    if (!label || !userId) {
        throw new BadRequestError('Missing parameters to create integration');
    }

    return await createIntegration(label, userId);
};

const createIntegration = async (label: string, ownerId: number): Promise<Integration> => {
    const logger = getLogger();
    logger.info(`Creating new integration with label: ${label}`);

    if (isNaN(ownerId)) {
        throw new BadRequestError('Invalid owner ID');
    }

    try {
        // Insert integration and user assignment in a transaction
        const integration = await db.transaction(async (tx) => {
            const integration = await tx
                .insert(integrations)
                .values({
                    label,
                    ownerId,
                })
                .returning();

            await tx.insert(userAssignments).values({
                integrationId: integration[0].integrationId,
                userId: ownerId,
            });

            return integration[0];
        });

        logger.info(`Successfully created integration '${label}:${integration.integrationId}'`);

        return {
            id: integration.integrationId,
            label: integration.label,
            owner: integration.ownerId,
            secret: integration.secret,
        };
    } catch (error: any) {
        logger.error(`Failed to create integration '${label}'`, {error: error?.message});
        throw new InternalServerError('Failed to create integration');
    }
};

export const deleteIntegration = async (id: string, integrationIds: string[], userId: number): Promise<void> => {
    const logger = getLogger();
    logger.info(`User ${userId} is attempting to delete integration ${id}`);

    try {
        await withRlsTransaction(integrationIds, async (tx) => {
            // Delete integration (cascades to user-assignments and notification-rules via foreign key)
            await tx.delete(integrations).where(and(eq(integrations.integrationId, id), eq(integrations.ownerId, userId)));
        });

        logger.info(`Successfully deleted integration '${id}'`);
    } catch (error: any) {
        if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
            throw error;
        }
        logger.error(`Failed to delete integration ${id}`, {error: error?.message});
        throw new InternalServerError('Failed to delete integration');
    }
};

export const getUserIntegrations = async (userId: number): Promise<string[]> => {
    const logger = getLogger();
    logger.info(`Getting integrations for user ${userId}`);
    if (isNaN(userId)) {
        logger.warn(`Invalid user ID: ${userId}`);
        return [];
    }

    const assignments = await db
        .select({integrationId: userAssignments.integrationId})
        .from(userAssignments)
        .where(eq(userAssignments.userId, userId));

    return assignments.map((a) => a.integrationId);
};
