import {generateDrizzleJson, generateMigration} from 'drizzle-kit/api-postgres';
import {readFileSync, writeFileSync} from 'node:fs';
import * as schema from '../src/schema/index.ts';

const [previousPath, nextPath] = process.argv.slice(2);
if (!previousPath || !nextPath) {
    throw new Error('Usage: draft-migration.mts <previous snapshot.json> <new snapshot.json>');
}

const previous = JSON.parse(readFileSync(previousPath, 'utf8'));
const current = await generateDrizzleJson(schema, previous.id, ['gitgazer', 'github']);
// Key order: keeps `version` first like the committed snapshots.
writeFileSync(nextPath, `${JSON.stringify({version: current.version, ...current}, null, 2)}\n`);

console.log(JSON.stringify(await generateMigration(previous, current), null, 2));
