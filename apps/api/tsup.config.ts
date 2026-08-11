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
    // Explicitly bundle these packages to avoid runtime import errors
    noExternal: ['convict'],
    esbuildOptions(options) {
        options.alias = {
            '@gitgazer/db': '../../packages/db/src',
            '@': './src',
        };
    },
};

// Bundles land in tmp/<handler>; the zip step packages them into dist/, which is the uploadable artifact.
export default defineConfig([
    {
        name: 'api',
        ...shared,
        entry: {index: 'src/handlers/api.ts'},
        outDir: 'tmp/api',
    },
    {
        name: 'websocket',
        ...shared,
        entry: {index: 'src/handlers/websocket.ts'},
        outDir: 'tmp/websocket',
    },
    {
        name: 'worker',
        ...shared,
        entry: {index: 'src/handlers/worker.ts'},
        outDir: 'tmp/worker',
    },
    {
        name: 'org-sync-scheduler',
        ...shared,
        entry: {index: 'src/handlers/org-sync-scheduler.ts'},
        outDir: 'tmp/org-sync-scheduler',
    },
    {
        name: 'backfill-worker',
        ...shared,
        entry: {index: 'src/handlers/backfill-worker.ts'},
        outDir: 'tmp/backfill-worker',
    },
    {
        name: 'http-proxy',
        ...shared,
        entry: {index: 'src/handlers/http-proxy.ts'},
        outDir: 'tmp/http-proxy',
    },
]);
