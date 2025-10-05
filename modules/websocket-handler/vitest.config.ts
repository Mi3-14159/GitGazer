import {resolve} from 'path';
import {defineConfig} from 'vitest/config';

import tsconfig from './tsconfig.json';

export default defineConfig({
    test: {
        environment: 'node',
        alias: Object.fromEntries(
            Object.entries(tsconfig.compilerOptions.paths).map(([key, value]) => [
                key.replace('/*', ''),
                resolve(__dirname, value[0].replace('/*', '')),
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
