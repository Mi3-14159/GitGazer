import {sendMessageBatch} from '@/shared/clients/sqs.client';
import config from '@/shared/config';

import type {BackfillTask} from './tasks';

/**
 * Enqueues backfill follow-up tasks onto the standard backfill queue. Used both
 * to seed a run (direct invoke -> `discover`) and for in-flight fan-out
 * (pages -> per-entity tasks, self-enqueue of the next page).
 */
export const sendBackfillTasks = async (tasks: BackfillTask[]): Promise<void> => {
    if (tasks.length === 0) return;

    const queueUrl = config.get('backfillQueueUrl');
    if (!queueUrl) {
        throw new Error('backfillQueueUrl is not configured (set BACKFILL_QUEUE_URL)');
    }

    await sendMessageBatch(
        queueUrl,
        // `integrationId` is the SQS fair-queue tenant key: concurrent backfills
        // for different integrations won't starve each other's dwell time.
        tasks.map((task) => ({body: JSON.stringify(task), groupId: task.integrationId})),
    );
};
