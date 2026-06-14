import {resolve} from 'path';

import vue from '@vitejs/plugin-vue';
import {defineConfig} from 'vitest/config';

// Standalone Vitest config. The app's vite.config.ts pulls in plugins
// (basic-ssl, tailwind, figma capture) that are irrelevant to unit tests, so
// we keep a minimal config here and only mirror the pieces tests rely on.
export default defineConfig({
    plugins: [vue()],
    resolve: {
        // MIRROR apps/web/vite.config.ts resolve.alias exactly.
        alias: {
            '@': resolve(__dirname, 'src'),
            '@common': resolve(__dirname, '../../packages/db/src'),
        },
        extensions: ['.js', '.json', '.jsx', '.mjs', '.ts', '.tsx', '.vue'],
    },
    test: {
        environment: 'happy-dom',
        globals: true,
        clearMocks: true,
        include: ['src/**/*.test.ts'],
        // useAuth/workflows read import.meta.env.VITE_* at module load.
        env: {
            VITE_REST_API_ENDPOINT: 'https://api.test.local',
            VITE_WEBSOCKET_API_ENDPOINT: '',
            VITE_COGNITO_DOMAIN: 'auth.test.local',
            VITE_COGNITO_USER_POOL_CLIENT_ID: 'test-client-id',
        },
    },
});
