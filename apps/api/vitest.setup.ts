import {beforeEach, vi} from 'vitest';

// Mock the logger globally
vi.mock('@/logger', () => ({
    getLogger: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    })),
    newLogger: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        injectLambdaContext: vi.fn(),
    })),
}));

// Reset all mocks before each test
beforeEach(() => {
    vi.clearAllMocks();
});
