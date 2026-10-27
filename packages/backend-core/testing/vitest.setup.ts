import {beforeEach, vi} from 'vitest';

// Mock the logger globally
vi.mock('@gitgazer/backend-core/logger', () => ({
    getLogger: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        appendKeys: vi.fn(),
        resetKeys: vi.fn(),
        addContext: vi.fn(),
        logEventIfEnabled: vi.fn(),
    })),
    runWithRequestLogger: vi.fn((_keys: Record<string, string>, fn: () => Promise<unknown>) => fn()),
    newLogger: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        injectLambdaContext: vi.fn(),
        appendKeys: vi.fn(),
    })),
}));

// Reset all mocks before each test
beforeEach(() => {
    vi.clearAllMocks();
});
