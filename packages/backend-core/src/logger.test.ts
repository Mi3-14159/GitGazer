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
});
