// Plugins
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import Vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';

// Utilities
import {resolve} from 'path';
import {defineConfig} from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        Vue(),
        tailwindcss(),
        Components(),
        basicSsl({
            name: 'app.gitgazer.local',
            domains: ['app.gitgazer.local'],
            certDir: resolve(__dirname, 'certs'),
        }),
    ],
    define: {'process.env': {}},
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
            '@common': resolve(__dirname, '../../packages/db/src'),
        },
        extensions: ['.js', '.json', '.jsx', '.mjs', '.ts', '.tsx', '.vue'],
    },
    server: {
        port: 5173,
        host: 'app.gitgazer.local',
        allowedHosts: ['app.gitgazer.local'],
        proxy: {
            '/api': {
                target: 'http://localhost:8080',
                changeOrigin: true,
                secure: false,
            },
        },
    },
});
