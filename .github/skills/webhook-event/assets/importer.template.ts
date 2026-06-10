// Template: apps/api/src/domains/webhooks/importers/<event>.importer.ts
// Called from the switch in importers/index.ts, INSIDE the writer-role withRlsTransaction.
// It receives the shared `tx` — never open its own transaction.
// Persistence must be idempotent: SQS FIFO can redeliver the same event.

import { getLogger } from '@/shared/logger';
import { RdsTransaction } from '@gitgazer/db/client';
// import {things} from '@gitgazer/db/schema/github/<file>';

// Payload type comes from @octokit/webhooks-types (re-exported via @gitgazer/db/types).
// import type {ThingEvent} from '@gitgazer/db/types';

export const importThing = async (params: {
    tx: RdsTransaction;
    integrationId: string;
    event: unknown; // narrow to the Octokit payload type, e.g. ThingEvent
}): Promise<{stale: boolean}> => {
    const logger = getLogger();
    const {tx, integrationId, event} = params;
    logger.info('Importing thing event', {integrationId});

    // const payload = event as ThingEvent;
    // const row = {
    //     integrationId,
    //     id: payload.thing.id,
    //     name: payload.thing.name,
    //     updatedAt: new Date(payload.thing.updated_at),
    // };

    // Idempotent upsert: only writes when the incoming data actually differs.
    // const result = await tx
    //     .insert(things)
    //     .values(row)
    //     .onConflictDoUpdate({
    //         target: [things.integrationId, things.id],
    //         set: {name: sql`EXCLUDED.name`, updatedAt: sql`EXCLUDED.updated_at`},
    //         setWhere: sql`${things.name} IS DISTINCT FROM EXCLUDED.name`,
    //     })
    //     .returning();
    //
    // // `stale` = the row already matched (no real change) → skip WebSocket fan-out upstream.
    // return {stale: result.length === 0};

    return {stale: false};
};
