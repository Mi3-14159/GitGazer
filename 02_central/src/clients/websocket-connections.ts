import {db} from '@gitgazer/db/client';
import {wsConnections} from '@gitgazer/db/schema/gitgazer';
import {getLogger} from '@/logger';
import {WebsocketConnection} from '@/types';
import {and, eq} from 'drizzle-orm';

export const getConnections = async (integrationId: string): Promise<WebsocketConnection[]> => {
    const logger = getLogger();
    logger.info(`Getting connections for integration ${integrationId}`, {integrationId});

    const connections = await db.select().from(wsConnections).where(eq(wsConnections.integrationId, integrationId)).limit(1000);

    return connections.map((conn) => ({
        integrationId: conn.integrationId,
        connectionId: conn.connectionId,
        userId: conn.userId,
        connectedAt: conn.connectedAt.toISOString(),
    }));
};

export const deleteConnection = async (params: {integrationId: string; connectionId: string}): Promise<void> => {
    const logger = getLogger();
    logger.info(`Deleting connection ${params.connectionId} for integration ${params.integrationId}`, {params});

    await db
        .delete(wsConnections)
        .where(and(eq(wsConnections.integrationId, params.integrationId), eq(wsConnections.connectionId, params.connectionId)));
};
