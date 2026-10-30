import type {AppEnv} from '@/shared/hono/env';
import type {AppContext} from '@gitgazer/backend-core/types';
import type {MiddlewareHandler} from 'hono';
import {createServer, type Server} from 'node:net';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
    initDb: vi.fn(),
    loadConfig: vi.fn(),
    closeDb: vi.fn(),
    slowRouteEntered: vi.fn(),
}));

// The real logger, so the request scope is tested; dev mode would log through console instead of stdout
vi.hoisted(() => vi.stubEnv('POWERTOOLS_DEV', 'false'));
vi.mock('@gitgazer/backend-core/logger', async (importOriginal) => importOriginal());
vi.mock('@gitgazer/backend-core/bootstrap', () => ({}));
vi.mock('@gitgazer/backend-core/config', () => ({default: {get: vi.fn(() => [])}, loadConfig: mocks.loadConfig}));
vi.mock('@gitgazer/db/client', () => ({db: {}, initDb: mocks.initDb, closeDb: mocks.closeDb, withRlsTransaction: vi.fn()}));
vi.mock('@/shared/middleware/authentication', () => ({
    authenticate: (async (c, next) => {
        c.set('appContext', {userId: Number(c.req.header('x-test-user'))} as AppContext);
        await next();
    }) satisfies MiddlewareHandler<AppEnv>,
}));
vi.mock('@/shared/middleware/authorization', () => ({authorize: async (_c: unknown, next: () => Promise<void>) => next()}));
vi.mock('@/domains/users/users.routes', async () => {
    const {Hono} = await import('hono');
    const {getLogger} = await import('@gitgazer/backend-core/logger');
    const router = new Hono<AppEnv>();
    router.get('/slow', async (c) => {
        mocks.slowRouteEntered();
        await new Promise((resolve) => setTimeout(resolve, 50));
        getLogger().info('slow route done', {userId: c.var.appContext?.userId});
        return c.json({userId: c.var.appContext?.userId});
    });
    router.get('/cookies', (c) => {
        c.header('set-cookie', 'accessToken=a; Secure', {append: true});
        c.header('set-cookie', 'idToken=i; Secure', {append: true});
        c.header('set-cookie', 'refreshToken=r; Secure', {append: true});
        return c.body(null, 204);
    });
    return {default: router};
});

const freePort = async (): Promise<number> => {
    const probe: Server = createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const {port} = probe.address() as {port: number};
    await new Promise((resolve) => probe.close(resolve));
    return port;
};

const getSlow = (port: number, userId: number, headers: Record<string, string> = {}) =>
    fetch(`http://127.0.0.1:${port}/api/slow`, {headers: {'x-test-user': String(userId), ...headers}}).then((res) => res.json());

describe('server', () => {
    let sigtermListeners: unknown[];
    let servers: {close: () => void}[];
    let logLines: string[];

    beforeEach(() => {
        vi.resetModules();
        sigtermListeners = process.listeners('SIGTERM');
        servers = [];
        logLines = [];
        vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
            logLines.push(String(chunk));
            return true;
        });
    });

    afterEach(() => {
        for (const listener of process.listeners('SIGTERM')) {
            if (!sigtermListeners.includes(listener)) {
                process.removeListener('SIGTERM', listener);
            }
        }
        servers.forEach((server) => server.close());
        vi.restoreAllMocks();
    });

    const start = async (endpoint: string) => {
        const {startServer} = await import('@/server');
        const server = await startServer(endpoint);
        servers.push(server);
        return {server, port: (server.address() as {port: number}).port};
    };

    it('keeps two users apart under concurrency', async () => {
        const {port} = await start('127.0.0.1:0');

        const users = Array.from({length: 50}, (_, i) => (i % 2) + 1);
        const bodies = await Promise.all(users.map((userId) => getSlow(port, userId)));

        expect(bodies).toEqual(users.map((userId) => ({userId})));
    });

    it('keeps the log keys of concurrent requests apart', async () => {
        const {port} = await start('127.0.0.1:0');

        const users = Array.from({length: 20}, (_, i) => (i % 2) + 1);
        await Promise.all(users.map((userId, i) => getSlow(port, userId, {'lambda-web-request-id': `req-${i}-user-${userId}`})));

        const routeLogs = logLines.map((line) => JSON.parse(line)).filter((log) => log.message === 'slow route done');
        expect(routeLogs).toHaveLength(users.length);
        expect(new Set(routeLogs.map((log) => log.requestId)).size).toBe(users.length);
        for (const log of routeLogs) {
            expect(log.requestId).toMatch(new RegExp(`^req-\\d+-user-${log.userId}$`));
        }
    });

    it('sends each cookie as its own Set-Cookie header', async () => {
        const {port} = await start('127.0.0.1:0');

        const res = await fetch(`http://127.0.0.1:${port}/api/cookies`, {headers: {'x-test-user': '1'}});

        expect(res.headers.getSetCookie()).toEqual(['accessToken=a; Secure', 'idToken=i; Secure', 'refreshToken=r; Secure']);
    });

    it('rejects the start when the port is taken', async () => {
        const blocker: Server = createServer();
        await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
        const {port} = blocker.address() as {port: number};

        await expect(start(`127.0.0.1:${port}`)).rejects.toMatchObject({code: 'EADDRINUSE'});
        blocker.close();
    });

    it('runs init before accepting requests', async () => {
        let finishInit = () => {};
        mocks.initDb.mockReturnValue(new Promise<void>((resolve) => (finishInit = resolve)));
        const port = await freePort();

        const started = start(`127.0.0.1:${port}`);
        await new Promise((resolve) => setTimeout(resolve, 20));

        await expect(getSlow(port, 1)).rejects.toThrow();
        expect(mocks.loadConfig).not.toHaveBeenCalled();

        finishInit();
        await started;

        expect(mocks.loadConfig).toHaveBeenCalledOnce();
        expect(await getSlow(port, 1)).toEqual({userId: 1});
    });

    it('drains in-flight requests on SIGTERM', async () => {
        const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        const {port} = await start('127.0.0.1:0');

        const inFlight = getSlow(port, 1);
        await vi.waitFor(() => expect(mocks.slowRouteEntered).toHaveBeenCalled(), {interval: 1});
        process.emit('SIGTERM');

        await expect(getSlow(port, 2)).rejects.toThrow();
        expect(mocks.closeDb).not.toHaveBeenCalled();
        expect(await inFlight).toEqual({userId: 1});
        await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
        expect(mocks.closeDb).toHaveBeenCalledOnce();
    });
});
