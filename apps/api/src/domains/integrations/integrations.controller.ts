import {createEventLogEntry} from '@/domains/event-log/event-log.controller';
import {deprovisionAllWebhooks, updateAllWebhookSecrets} from '@/domains/github-app/webhook-provisioning';
import {ensureHttpError} from '@/shared/errors';
import {getLogger} from '@/shared/logger';
import {BadRequestError, InternalServerError, UnauthorizedError} from '@aws-lambda-powertools/event-handler/http';
import {db, RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {integrationsQueryRelations} from '@gitgazer/db/queries';
import {gitgazerWriter} from '@gitgazer/db/schema/app';
import {githubAppWebhooks, integrations, userAssignments} from '@gitgazer/db/schema/github/workflows';
import {Integration, isMemberRole, type MemberRole, type OrgSyncDefaultRole} from '@gitgazer/db/types';
import {and, eq, sql} from 'drizzle-orm';

export const getIntegrations = async (params: {integrationIds: string[]}): Promise<Integration[]> => {
    const logger = getLogger();
    const {integrationIds} = params;

    logger.info(`Getting integrations: ${integrationIds.join(', ')}`, {integrationIds});
    if (integrationIds.length === 0) {
        return [];
    }

    const results = await withRlsTransaction({
        integrationIds,
        callback: async (tx: RdsTransaction) => {
            return await tx.query.integrations.findMany({
                with: integrationsQueryRelations,
            });
        },
    });

    return results;
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
        const results = await withRlsTransaction({
            integrationIds,
            userName: gitgazerWriter.name,
            callback: async (tx: RdsTransaction) => {
                return await tx.update(integrations).set({label: label.trim()}).where(eq(integrations.integrationId, id)).returning();
            },
        });

        if (results.length === 0) {
            throw new UnauthorizedError('Integration not found or access denied');
        }

        // Fetch the updated integration with relations
        const fullIntegrations = await getIntegrations({integrationIds: [id]});
        if (!fullIntegrations[0]) {
            throw new InternalServerError('Failed to fetch updated integration');
        }

        await createEventLogEntry({
            integrationId: id,
            category: 'integration',
            type: 'info',
            title: 'Integration renamed',
            message: `Integration label updated to "${label.trim()}"`,
            metadata: {integrationId: id, integrationLabel: label.trim()},
        });

        return fullIntegrations[0];
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
        const insertedIntegration = await db.transaction(async (tx) => {
            const [integration] = await tx
                .insert(integrations)
                .values({
                    label: label.trim(),
                    ownerId,
                })
                .returning();

            await tx.insert(userAssignments).values({
                integrationId: integration.integrationId,
                userId: ownerId,
                role: 'owner',
            });

            return integration;
        });

        logger.info(`Successfully created integration '${label}:${insertedIntegration.integrationId}'`);

        // Fetch the created integration with relations
        const fullIntegrations = await getIntegrations({integrationIds: [insertedIntegration.integrationId]});
        const created = fullIntegrations[0] ?? {...insertedIntegration, githubAppInstallations: []};

        await createEventLogEntry({
            integrationId: insertedIntegration.integrationId,
            category: 'integration',
            type: 'success',
            title: 'Integration created',
            message: `Integration "${label.trim()}" was created`,
            metadata: {integrationId: insertedIntegration.integrationId, integrationLabel: label.trim()},
        });

        return created;
    } catch (error: any) {
        logger.error(`Failed to create integration '${label}'`, {error: error?.message});
        throw ensureHttpError(error, 'Failed to create integration');
    }
};

export const deleteIntegration = async (id: string, integrationIds: string[], userId: number): Promise<void> => {
    const logger = getLogger();
    logger.info(`User ${userId} is attempting to delete integration ${id}`);

    try {
        // Remove any leftover webhooks from GitHub (e.g. from a previously unlinked GitHub App)
        const webhooks = await withRlsTransaction({
            integrationIds,
            callback: async (tx: RdsTransaction) => {
                return await tx
                    .select({installationId: githubAppWebhooks.installationId})
                    .from(githubAppWebhooks)
                    .where(eq(githubAppWebhooks.integrationId, id))
                    .groupBy(githubAppWebhooks.installationId);
            },
        });

        for (const {installationId} of webhooks) {
            try {
                await deprovisionAllWebhooks(id, installationId);
            } catch (error) {
                logger.warn(`Failed to deprovision webhooks for installation ${installationId}`, {error});
            }
        }

        await withRlsTransaction({
            integrationIds,
            userName: gitgazerWriter.name,
            callback: async (tx: RdsTransaction) => {
                // Delete integration (cascades to user-assignments and notification-rules via foreign key)
                await tx.delete(integrations).where(and(eq(integrations.integrationId, id), eq(integrations.ownerId, userId)));
            },
        });

        // Note: event log entry is not persisted because event_log_entries cascade-deletes with the integration.
        // The log line below serves as the audit trail.
        logger.info(`Successfully deleted integration '${id}'`);
    } catch (error: any) {
        logger.error(`Failed to delete integration ${id}`, {error: error?.message});
        throw ensureHttpError(error, 'Failed to delete integration');
    }
};

export const getUserIntegrationRoles = async (userId: number): Promise<Record<string, MemberRole>> => {
    const logger = getLogger();
    logger.debug(`Getting integration roles for user ${userId}`);
    if (isNaN(userId)) {
        logger.warn(`Invalid user ID: ${userId}`);
        return {};
    }

    const assignments = await db
        .select({integrationId: userAssignments.integrationId, role: userAssignments.role})
        .from(userAssignments)
        .where(eq(userAssignments.userId, userId));

    const roles: Record<string, MemberRole> = {};
    for (const a of assignments) {
        if (isMemberRole(a.role)) {
            roles[a.integrationId] = a.role;
        } else {
            logger.warn(`Unexpected role value in user_assignments`, {userId, integrationId: a.integrationId, role: a.role});
        }
    }
    return roles;
};

export const rotateSecret = async (params: {integrationId: string; integrationIds: string[]}): Promise<Integration> => {
    const logger = getLogger();
    const {integrationId, integrationIds} = params;

    logger.info(`Rotating secret for integration ${integrationId}`);

    // Generate a new secret and update the integration
    const results = await withRlsTransaction({
        integrationIds,
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            return await tx
                .update(integrations)
                .set({secret: sql`gen_random_uuid()`})
                .where(eq(integrations.integrationId, integrationId))
                .returning();
        },
    });

    if (results.length === 0) {
        throw new UnauthorizedError('Integration not found or access denied');
    }

    await createEventLogEntry({
        integrationId,
        category: 'integration',
        type: 'warning',
        title: 'Secret rotated',
        message: 'The integration webhook secret was rotated.',
        metadata: {integrationId},
    });

    const newSecret = results[0].secret;

    // Update all linked GitHub App webhooks with the new secret
    const webhookInstallations = await withRlsTransaction({
        integrationIds,
        callback: async (tx: RdsTransaction) => {
            return await tx
                .select({installationId: githubAppWebhooks.installationId})
                .from(githubAppWebhooks)
                .where(eq(githubAppWebhooks.integrationId, integrationId))
                .groupBy(githubAppWebhooks.installationId);
        },
    });

    for (const {installationId} of webhookInstallations) {
        try {
            await updateAllWebhookSecrets(integrationId, installationId, newSecret);
        } catch (error) {
            logger.error(`Failed to update webhook secrets for installation ${installationId}`, {error});
            await createEventLogEntry({
                integrationId,
                category: 'integration',
                type: 'failure',
                title: 'Secret rotation failed',
                message: 'Failed to update webhook secrets for the integration.',
                metadata: {integrationId},
            });
        }
    }

    // Return the full integration with relations
    const fullIntegrations = await getIntegrations({integrationIds: [integrationId]});
    if (!fullIntegrations[0]) {
        throw new InternalServerError('Failed to fetch updated integration');
    }

    await createEventLogEntry({
        integrationId,
        category: 'integration',
        type: 'warning',
        title: 'Secret rotation completed',
        message: 'All linked GitHub App webhooks have been updated.',
        metadata: {integrationId},
    });

    return fullIntegrations[0];
};

export const updateOrgSyncSettings = async (params: {
    integrationId: string;
    defaultRole: OrgSyncDefaultRole;
    integrationIds: string[];
}): Promise<void> => {
    const logger = getLogger();
    const {integrationId, defaultRole, integrationIds} = params;

    logger.info(`Updating org sync default role for integration ${integrationId} to ${defaultRole}`);

    const results = await withRlsTransaction({
        integrationIds,
        userName: gitgazerWriter.name,
        callback: async (tx: RdsTransaction) => {
            return await tx
                .update(integrations)
                .set({orgSyncDefaultRole: defaultRole})
                .where(eq(integrations.integrationId, integrationId))
                .returning();
        },
    });

    if (results.length === 0) {
        throw new UnauthorizedError('Integration not found or access denied');
    }

    await createEventLogEntry({
        integrationId,
        category: 'integration',
        type: 'info',
        title: 'Org sync settings updated',
        message: `Default role for org-synced members changed to "${defaultRole}"`,
        metadata: {defaultRole},
    });
};
