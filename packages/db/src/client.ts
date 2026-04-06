import {RDSDataClient} from '@aws-sdk/client-rds-data';
import {Signer} from '@aws-sdk/rds-signer';
import {sql} from 'drizzle-orm';
import {drizzle as drizzleDataApi} from 'drizzle-orm/aws-data-api/pg';
import {drizzle as drizzleNodePg, type NodePgDatabase} from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';
import {gitgazerReader} from './schema';

type DbClient = NodePgDatabase<typeof schema>;
type ConnectionMode = 'rds-proxy' | 'data-api';

let _db: DbClient | null = null;
let _pool: pg.Pool | null = null;
let _initPromise: Promise<void> | null = null;
let _signer: Signer | null = null;

function getConnectionMode(): ConnectionMode {
    const mode = process.env['DB_CONNECTION_MODE'] || 'rds-proxy';
    if (mode !== 'rds-proxy' && mode !== 'data-api') {
        throw new Error(`Invalid DB_CONNECTION_MODE: ${mode}. Must be 'rds-proxy' or 'data-api'.`);
    }
    return mode;
}

function initializeRdsProxy(): void {
    const proxyEndpoint = process.env['RDS_PROXY_ENDPOINT'];
    const database = process.env['RDS_DATABASE'];
    const dbUser = process.env['RDS_DB_USER'];
    const proxyHostname = process.env['RDS_PROXY_HOSTNAME'] || proxyEndpoint;

    if (!proxyEndpoint || !database || !dbUser || !proxyHostname) {
        throw new Error('Missing required environment variables: RDS_PROXY_ENDPOINT, RDS_DATABASE, RDS_DB_USER, RDS_PROXY_HOSTNAME');
    }

    _signer = new Signer({
        hostname: proxyHostname,
        port: 5432,
        username: dbUser,
    });

    _pool = new pg.Pool({
        host: proxyEndpoint,
        port: 5432,
        database,
        user: dbUser,
        password: () => _signer!.getAuthToken(),
        ssl: {rejectUnauthorized: false},
        max: 1,
        idleTimeoutMillis: 10 * 60 * 1000, // recycle idle connections before IAM token expiry (15 min)
    });

    _db = drizzleNodePg(_pool, {
        schema,
        logger: process.env['DB_LOGGING'] === 'true',
    });
}

function initializeDataApi(): void {
    const database = process.env['RDS_DATABASE'];
    const resourceArn = process.env['RDS_RESOURCE_ARN'];
    const secretArn = process.env['RDS_SECRET_ARN'];

    if (!database || !resourceArn || !secretArn) {
        throw new Error('Missing required environment variables for Data API: RDS_DATABASE, RDS_RESOURCE_ARN, RDS_SECRET_ARN');
    }

    const client = new RDSDataClient({});

    // Both adapters extend PgDatabase and share the same runtime API surface.
    // The cast is safe — only the raw execute() return wrapper differs.
    _db = drizzleDataApi(client, {
        database,
        resourceArn,
        secretArn,
        schema,
        logger: process.env['DB_LOGGING'] === 'true',
    }) as unknown as DbClient;
}

async function initialize(): Promise<void> {
    if (_db) return;

    const mode = getConnectionMode();
    if (mode === 'data-api') {
        initializeDataApi();
    } else {
        initializeRdsProxy();
    }
}

export async function initDb(): Promise<void> {
    if (!_initPromise) {
        _initPromise = initialize();
    }
    return _initPromise;
}

// Proxy preserves the synchronous `db` export so all existing consumers work unchanged.
// Handlers must call `await initDb()` during cold-start before any DB access.
export const db: DbClient = new Proxy({} as DbClient, {
    get(_, prop) {
        if (!_db) throw new Error('Database not initialized. Call initDb() before accessing db.');
        return (_db as never)[prop];
    },
});

export type RdsTransaction = Parameters<Parameters<DbClient['transaction']>[0]>[0];

const INTEGRATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const withRlsTransaction = async <T>(params: {
    integrationIds: string[];
    userName?: string;
    lockTimeoutS?: number;
    callback: (tx: RdsTransaction) => Promise<T>;
}): Promise<T> => {
    const {integrationIds, userName = gitgazerReader.name, callback, lockTimeoutS = 5} = params;
    if (!Number.isInteger(lockTimeoutS) || lockTimeoutS <= 0) {
        throw new Error('lockTimeoutS must be a positive integer');
    }

    // Validate integration IDs to prevent SQL injection via the raw SET LOCAL
    for (const id of integrationIds) {
        if (!INTEGRATION_ID_PATTERN.test(id)) {
            throw new Error(`Invalid integration ID: ${id}`);
        }
    }

    return await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL ROLE ${sql.identifier(userName)};`);
        await tx.execute(sql.raw(`SET LOCAL rls.integration_ids = '${integrationIds.join(',')}';`));
        await tx.execute(sql.raw(`SET LOCAL lock_timeout = '${lockTimeoutS}s';`));

        return await callback(tx);
    });
};
