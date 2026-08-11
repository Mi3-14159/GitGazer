import {resolve} from 'path';
import {defineConfig} from 'vitest/config';

import tsconfig from './tsconfig.json' with {type: 'json'};

export default defineConfig({
    test: {
        environment: 'node',
        setupFiles: ['../../../packages/backend-core/testing/vitest.setup.ts'],
        clearMocks: true,
        globals: true,
        alias: Object.fromEntries(
            Object.entries(tsconfig.compilerOptions.paths).map(([key, value]) => [
                key.replace('/*', ''),
                resolve(import.meta.dirname, value[0].replace('/*', '')),
            ]),
        ),
        projects: [
            {
                extends: true,
                test: {
                    name: 'unit',
                    include: ['src/**/*.test.{ts,tsx,js}'],
                },
            },
        ],
    },
});
