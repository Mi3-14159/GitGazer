import {defineConfig} from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        clearMocks: true,
        // Booting PGlite with pgcrypto and running the migrations exceeds the 10 s default on a busy CI runner
        hookTimeout: 60_000,
        projects: [
            {
                extends: true,
                test: {
                    name: 'unit',
                    include: ['src/**/*.test.ts'],
                },
            },
        ],
    },
});
