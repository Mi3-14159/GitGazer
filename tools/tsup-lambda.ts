import {defineConfig, Options} from 'tsup';

// Alias targets are resolved from each app's own directory, which is always apps/lambdas/<name>.
const shared: Options = {
    format: ['cjs'],
    target: 'node24',
    platform: 'node',
    bundle: true,
    sourcemap: true,
    treeshake: true,
    // Bundle all dependencies except @aws-sdk (provided by Lambda runtime)
    external: [/^@aws-sdk/],
    // Runtime npm packages belong in devDependencies: tsup externalizes package.json
    // dependencies, and nothing is installed alongside the zip at runtime.
    noExternal: [/^@gitgazer\//],
    esbuildOptions(options) {
        options.alias = {
            '@gitgazer/backend-core': '../../../packages/backend-core/src',
            '@gitgazer/backend-services': '../../../packages/backend-services/src',
            '@gitgazer/github-import': '../../../packages/github-import/src',
            '@gitgazer/db': '../../../packages/db/src',
            '@': './src',
        };
    },
};

// Emits tmp/index.js; the app's zip script packages it as dist/gitgazer-<name>.zip, the uploadable artifact.
export const lambdaConfig = (name: string) =>
    defineConfig({
        ...shared,
        name,
        entry: {index: 'src/index.ts'},
        outDir: 'tmp',
    });
