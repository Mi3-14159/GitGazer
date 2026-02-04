// Plugins
import basicSsl from '@vitejs/plugin-basic-ssl';
import Vue from '@vitejs/plugin-vue';
import ViteFonts from 'unplugin-fonts/vite';
import Components from 'unplugin-vue-components/vite';
import Vuetify, {transformAssetUrls} from 'vite-plugin-vuetify';

// Utilities
import {resolve} from 'path';
import {defineConfig} from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        Vue({
            template: {transformAssetUrls},
        }),
        // https://github.com/vuetifyjs/vuetify-loader/tree/master/packages/vite-plugin#readme
        Vuetify(),
        Components(),
        ViteFonts({
            google: {
                families: [
                    {
                        name: 'Roboto',
                        styles: 'wght@100;300;400;500;700;900',
                        defer: true,
                    },
                ],
            },
        }),
        basicSsl(),
    ],
    define: {'process.env': {}},
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
            '@common': resolve(__dirname, '../common/src'),
        },
        extensions: ['.js', '.json', '.jsx', '.mjs', '.ts', '.tsx', '.vue'],
    },
    server: {
        port: 5173,
        host: 'app.gitgazer.local',
        allowedHosts: ['app.gitgazer.local'],
    },
});
