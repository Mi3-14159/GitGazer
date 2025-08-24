import {defineConfig} from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
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
