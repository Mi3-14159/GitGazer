// Plugins
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import Vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';

// Utilities
import {resolve} from 'path';
import {defineConfig} from 'vite';

function figmaCapturePlugin() {
    return {
        name: 'figma-capture',
        transformIndexHtml(html: string, ctx: {server?: unknown}) {
            if (!ctx.server) return html;
            return html.replace('</head>', '        <script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async></script>\n    </head>');
        },
    };
}

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        Vue(),
        tailwindcss(),
        Components(),
        figmaCapturePlugin(),
        basicSsl({
            name: 'app.gitgazer.localhost',
            domains: ['app.gitgazer.localhost'],
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
        host: 'app.gitgazer.localhost',
        allowedHosts: ['app.gitgazer.localhost'],
        proxy: {
            '/api': {
                target: 'http://localhost:8080',
                changeOrigin: true,
                secure: false,
            },
        },
    },
});
