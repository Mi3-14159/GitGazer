import {RDSDataClient} from '@aws-sdk/client-rds-data';
import {Signer} from '@aws-sdk/rds-signer';
import {sql} from 'drizzle-orm';
import {drizzle as drizzleDataApi} from 'drizzle-orm/aws-data-api/pg';
import {drizzle as drizzleNodePg, type NodePgDatabase} from 'drizzle-orm/node-postgres';
import pg from 'pg';
import {contextPayload, INTEGRATION_ID_PATTERN, setSignedContext} from './queries/signedContext';
import {dbRelations, type DbRelations} from './schema/relations';
import {gitgazerMcp, gitgazerReader} from './schema';
import type {MemberRole} from './types/members';

export {INTEGRATION_ID_PATTERN};

type DbClient = NodePgDatabase<DbRelations>;
type ConnectionMode = 'rds-proxy' | 'data-api';

let _db: DbClient | null = null;
let _mcpDb: DbClient | null = null;
const _pools: pg.Pool[] = [];
// Counted in the api's connection budget in infra/api_web_function.tf
const MCP_POOL_MAX = 2;
let _initPromise: Promise<void> | null = null;

function getConnectionMode(): ConnectionMode {
    const mode = process.env['DB_CONNECTION_MODE'] || 'rds-proxy';
    if (mode !== 'rds-proxy' && mode !== 'data-api') {
        throw new Error(`Invalid DB_CONNECTION_MODE: ${mode}. Must be 'rds-proxy' or 'data-api'.`);
    }
    return mode;
}

function getPoolMax(): number {
    const max = Number(process.env['DB_POOL_MAX'] || 1);
    if (!Number.isInteger(max) || max < 1) {
        throw new Error(`Invalid DB_POOL_MAX: ${process.env['DB_POOL_MAX']}. Must be a positive integer.`);
    }
    return max;
}

function initializeRdsProxy(): void {
    const rdsHost = process.env['RDS_HOST'];
    const database = process.env['RDS_DATABASE'];
    const dbUser = process.env['RDS_DB_USER'];
    const rdsHostname = process.env['RDS_HOSTNAME'] || rdsHost;
    const rdsPort = process.env['RDS_PORT'] ? Number(process.env['RDS_PORT']) : 5432;

    if (!rdsHost || !database || !dbUser || !rdsHostname) {
        throw new Error('Missing required environment variables: RDS_HOST, RDS_DATABASE, RDS_DB_USER, RDS_HOSTNAME');
    }

    const createDb = (user: string, max: number): DbClient => {
        const signer = new Signer({hostname: rdsHostname, port: 5432, username: user});
        const pool = new pg.Pool({
            host: rdsHost,
            port: rdsPort,
            database,
            user,
            password: () => signer.getAuthToken(),
            ssl: {rejectUnauthorized: false},
            max,
            // Fail fast instead of hanging until the Lambda timeout when every connection is held, e.g. by open transactions
            connectionTimeoutMillis: 5000,
            idleTimeoutMillis: 10 * 60 * 1000, // recycle idle connections before IAM token expiry (15 min)
        });
        _pools.push(pool);
        return drizzleNodePg({client: pool, relations: dbRelations, logger: process.env['DB_LOGGING'] === 'true'});
    };

    _db = createDb(dbUser, getPoolMax());
    // MCP queries log in as gitgazer_mcp itself: a session whose login user owns the tables could switch its role back to it.
    _mcpDb = createDb(gitgazerMcp.name, MCP_POOL_MAX);
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
    _db = drizzleDataApi({
        client,
        database,
        resourceArn,
        secretArn,
        relations: dbRelations,
        logger: process.env['DB_LOGGING'] === 'true',
    }) as unknown as DbClient;
    // The Data API authenticates with one secret, so there is no separate MCP login in this mode.
    _mcpDb = _db;
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

export async function closeDb(): Promise<void> {
    await Promise.all(_pools.map((pool) => pool.end()));
}

const NOT_INITIALIZED = 'Database not initialized. Call initDb() before accessing db.';

// Proxies preserve the synchronous exports so all existing consumers work unchanged.
// Handlers must call `await initDb()` during cold-start before any DB access.
const lazyDb = (get: () => DbClient | null): DbClient =>
    new Proxy({} as DbClient, {
        get(_, prop) {
            const client = get();
            if (!client) throw new Error(NOT_INITIALIZED);
            return (client as never)[prop];
        },
    });

export const db: DbClient = lazyDb(() => _db);

/** Connection logged in as gitgazer_mcp, for running MCP callers' SQL. */
export const mcpDb: DbClient = lazyDb(() => _mcpDb);

// Throws before initDb(), so an MCP query reports that instead of being refused as Data API mode.
export const hasSeparateMcpLogin = (): boolean => {
    if (!_db) throw new Error(NOT_INITIALIZED);
    return _mcpDb !== null && _mcpDb !== _db;
};

export type RdsTransaction = Parameters<Parameters<DbClient['transaction']>[0]>[0];

/**
 * `integrationRoles` additionally signs the caller's roles into rls.signed_context for the role-aware views; it needs a
 * `client` logged in as the app login.
 */
export const withRlsTransaction = async <T>(params: {
    integrationIds: string[];
    integrationRoles?: Record<string, MemberRole>;
    userName?: string;
    lockTimeoutS?: number;
    statementTimeoutS?: number;
    readOnly?: boolean;
    client?: DbClient;
    callback: (tx: RdsTransaction) => Promise<T>;
}): Promise<T> => {
    const {
        integrationIds,
        integrationRoles,
        userName = gitgazerReader.name,
        callback,
        lockTimeoutS = 5,
        statementTimeoutS,
        readOnly = false,
        client = db,
    } = params;
    if (!Number.isInteger(lockTimeoutS) || lockTimeoutS <= 0) {
        throw new Error('lockTimeoutS must be a positive integer');
    }
    if (statementTimeoutS !== undefined && (!Number.isInteger(statementTimeoutS) || statementTimeoutS <= 0)) {
        throw new Error('statementTimeoutS must be a positive integer');
    }

    // Validate integration IDs to prevent SQL injection via the raw SET LOCAL
    for (const id of integrationIds) {
        if (!INTEGRATION_ID_PATTERN.test(id)) {
            throw new Error(`Invalid integration ID: ${id}`);
        }
    }
    const signedPayload = integrationRoles && contextPayload(integrationRoles);

    return await client.transaction(async (tx) => {
        // Must be declared before the transaction's first query.
        if (readOnly) {
            await tx.execute(sql.raw('SET TRANSACTION READ ONLY;'));
        }
        // Signed on this connection while it still runs as the app login: waiting for a second pooled connection
        // while holding this one would deadlock a busy pool (DB_POOL_MAX defaults to 1).
        if (signedPayload !== undefined) {
            await setSignedContext(tx, signedPayload, tx);
        }
        await tx.execute(sql`SET LOCAL ROLE ${sql.identifier(userName)};`);
        await tx.execute(sql.raw(`SET LOCAL rls.integration_ids = '${integrationIds.join(',')}';`));
        await tx.execute(sql.raw(`SET LOCAL lock_timeout = '${lockTimeoutS}s';`));
        if (statementTimeoutS !== undefined) {
            await tx.execute(sql.raw(`SET LOCAL statement_timeout = '${statementTimeoutS}s';`));
        }

        return await callback(tx);
    });
};
