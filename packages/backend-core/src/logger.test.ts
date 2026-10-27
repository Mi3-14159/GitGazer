import {afterEach, describe, expect, it, vi} from 'vitest';

const captureStdout = () => {
    const lines: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        lines.push(String(chunk));
        return true;
    });
    return lines;
};

describe('logger', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('redacts the invocation event and logged results', async () => {
        const {newLogger} = await vi.importActual<typeof import('./logger')>('./logger');
        const lines = captureStdout();
        const logger = newLogger();

        logger.logEventIfEnabled({headers: {authorization: 'Bearer secret-token'}, cookies: ['refreshToken=secret-refresh']}, true);
        logger.info('result', {result: {statusCode: 200, body: JSON.stringify({access_token: 'secret-access'})}});

        const output = lines.join('');
        expect(output).toContain('[REDACTED]');
        expect(output).not.toMatch(/secret-(token|refresh|access)/);
    });

    it('keeps keys of concurrent requests apart', async () => {
        const {getLogger, runWithRequestLogger} = await vi.importActual<typeof import('./logger')>('./logger');
        const lines = captureStdout();
        const handleRequest = (requestId: string) =>
            runWithRequestLogger({requestId}, async () => {
                for (let step = 0; step < 3; step++) {
                    await new Promise((resolve) => setTimeout(resolve, 5));
                    getLogger().info('step', {expectedRequestId: requestId});
                }
            });

        await Promise.all([handleRequest('req-1'), handleRequest('req-2')]);

        const logs = lines.map((line) => JSON.parse(line));
        expect(logs.map((log) => log.expectedRequestId)).toEqual(['req-1', 'req-2', 'req-1', 'req-2', 'req-1', 'req-2']);
        for (const log of logs) {
            expect(log.requestId).toBe(log.expectedRequestId);
        }
    });
});
