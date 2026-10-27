import '@gitgazer/backend-core/bootstrap';
import {initApp} from '@/app';
import {getLogger, runWithRequestLogger} from '@gitgazer/backend-core/logger';
import {closeDb} from '@gitgazer/db/client';
import {serve} from '@hono/node-server';
import type {Server} from 'node:http';

const logger = getLogger();

export const startServer = async (endpoint = process.env.AWS_LAMBDA_HTTP_ENDPOINT ?? '127.0.0.1:8080'): Promise<Server> => {
    const app = await initApp();
    const [hostname, port] = endpoint.split(':');

    const fetch = (req: Request) =>
        runWithRequestLogger({requestId: req.headers.get('lambda-web-request-id') ?? crypto.randomUUID()}, async () => app.fetch(req));

    const server = await new Promise<Server>((resolve, reject) => {
        const listening = serve({fetch, hostname, port: Number(port)}, (info) => {
            logger.info('Server listening', {address: info.address, port: info.port});
            resolve(listening as Server);
        });
        listening.once('error', reject);
    });

    let draining = false;
    // close() only drops connections that are idle when it is called; a kept-alive connection would hold it open after its last response
    server.on('request', (_req, res) => res.on('finish', () => draining && server.closeIdleConnections()));

    process.once('SIGTERM', () => {
        logger.info('SIGTERM received, draining in-flight requests');
        draining = true;
        server.close(async () => {
            await closeDb();
            process.exit(0);
        });
    });

    return server;
};

if (require.main === module) {
    startServer().catch((error) => {
        logger.error('Server failed to start', {error});
        process.exit(1);
    });
}
