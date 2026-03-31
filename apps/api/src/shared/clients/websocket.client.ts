import {getLogger} from '@/shared/logger';
import {WebsocketConnection} from '@/shared/types';
import {db} from '@gitgazer/db/client';
import {wsConnections} from '@gitgazer/db/schema/gitgazer';
import {type WebSocketChannel} from '@gitgazer/db/types';
import {and, eq} from 'drizzle-orm';

export const getConnections = async (integrationId: string, channel: WebSocketChannel): Promise<WebsocketConnection[]> => {
    const logger = getLogger();
    logger.info(`Getting connections for integration ${integrationId}`, {integrationId, channel});

    const connections = await db
        .select()
        .from(wsConnections)
        .where(and(eq(wsConnections.integrationId, integrationId), eq(wsConnections.channel, channel)))
        .limit(1000);

    return connections.map((conn) => ({
        integrationId: conn.integrationId,
        connectionId: conn.connectionId,
        userId: conn.userId,
        connectedAt: conn.connectedAt.toISOString(),
        channel: conn.channel,
    }));
};

export const deleteConnection = async (params: {integrationId: string; connectionId: string}): Promise<void> => {
    const logger = getLogger();
    logger.info(`Deleting connection ${params.connectionId} for integration ${params.integrationId}`, {params});

    await db
        .delete(wsConnections)
        .where(and(eq(wsConnections.integrationId, params.integrationId), eq(wsConnections.connectionId, params.connectionId)));
};
