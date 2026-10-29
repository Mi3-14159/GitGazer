import {generateDrizzleJson, generateMigration} from 'drizzle-kit/api-postgres';
import {readFileSync, writeFileSync} from 'node:fs';
import * as schema from '../src/schema/index.ts';

// drizzle-kit 1.0.0-rc.5's api bundle calls String.prototype.snake_case for view options (`.with(...)`) but never
// installs it; this is a copy of its own definition.
Object.defineProperty(String.prototype, 'snake_case', {
    value: function (this: string) {
        return this.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    },
    configurable: true,
    writable: true,
});

const [previousPath, nextPath] = process.argv.slice(2);
if (!previousPath || !nextPath) {
    throw new Error('Usage: draft-migration.mts <previous snapshot.json> <new snapshot.json>');
}

const previous = JSON.parse(readFileSync(previousPath, 'utf8'));
const current = await generateDrizzleJson(schema, previous.id, ['gitgazer', 'gitgazer_internal', 'github']);
// Key order: keeps `version` first like the committed snapshots.
writeFileSync(nextPath, `${JSON.stringify({version: current.version, ...current}, null, 2)}\n`);

console.log(JSON.stringify(await generateMigration(previous, current), null, 2));
