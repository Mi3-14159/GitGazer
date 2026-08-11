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
    // tsup externalizes package.json dependencies by default; these must be inlined into the bundle
    noExternal: ['convict', /^@gitgazer\//],
    esbuildOptions(options) {
        options.alias = {
            '@gitgazer/backend-core': '../../packages/backend-core/src',
            '@gitgazer/backend-services': '../../packages/backend-services/src',
            '@gitgazer/github-import': '../../packages/github-import/src',
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
        name: 'worker',
        ...shared,
        entry: {index: 'src/handlers/worker.ts'},
        outDir: 'tmp/worker',
    },
    {
        name: 'backfill-worker',
        ...shared,
        entry: {index: 'src/handlers/backfill-worker.ts'},
        outDir: 'tmp/backfill-worker',
    },
]);
