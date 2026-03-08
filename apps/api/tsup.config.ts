import {defineConfig, Options} from 'tsup';

const shared: Options = {
    format: ['cjs'],
    target: 'node24',
    platform: 'node',
    bundle: true,
    sourcemap: true,
    treeshake: true,
    // Bundle all dependencies except @aws-sdk (provided by Lambda runtime)
    external: [/^@aws-sdk/],
    esbuildOptions(options) {
        options.alias = {
            '@gitgazer/db': '../../packages/db/src',
            '@': './src',
        };
    },
};

export default defineConfig([
    {
        name: 'api',
        ...shared,
        entry: {index: 'src/handlers/api.ts'},
        outDir: 'dist/api',
    },
    {
        name: 'websocket',
        ...shared,
        entry: {index: 'src/handlers/websocket.ts'},
        outDir: 'dist/websocket',
    },
]);
