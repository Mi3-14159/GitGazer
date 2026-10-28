import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
    logger: {error: vi.fn()},
    startServer: vi.fn(async () => ({})),
}));

vi.mock('@gitgazer/backend-core/bootstrap', () => ({}));
vi.mock('@gitgazer/backend-core/logger', () => ({getLogger: () => mocks.logger}));
vi.mock('@/server', () => ({startServer: mocks.startServer}));

describe('api bundle entrypoint', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it('starts the http server', async () => {
        await import('@/index');
        expect(mocks.startServer).toHaveBeenCalledTimes(1);
    });

    it('logs and exits when the server fails to start', async () => {
        const error = new Error('EADDRINUSE');
        mocks.startServer.mockRejectedValueOnce(error);
        const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await import('@/index');
        await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));

        expect(mocks.logger.error).toHaveBeenCalledWith('Server failed to start', {error});
        exit.mockRestore();
    });
});
