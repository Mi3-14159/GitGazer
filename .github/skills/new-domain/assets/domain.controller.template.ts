// Template: apps/api/src/domains/<domain>/<domain>.controller.ts
// Business logic + RLS-scoped DB access. Every tenant-scoped query goes through withRlsTransaction.
// Default DB role is reader; pass userName: gitgazerWriter.name for writes.

import { getLogger } from '@/shared/logger';
import { BadRequestError } from '@aws-lambda-powertools/event-handler/http';
import { RdsTransaction, withRlsTransaction } from '@gitgazer/db/client';
import { gitgazerWriter } from '@gitgazer/db/schema/app';
// import {things} from '@gitgazer/db/schema/github/<file>'; // your table
// import {eq} from 'drizzle-orm';

export const getThings = async (params: {integrationIds: string[]}) => {
    const logger = getLogger();
    const {integrationIds} = params;

    if (integrationIds.length === 0) {
        return [];
    }

    logger.info('Getting things', {integrationIds});

    return await withRlsTransaction({
        integrationIds,
        callback: async (tx: RdsTransaction) => {
            // return await tx.query.things.findMany();
            return [];
        },
    });
};

export const createThing = async (params: {label: string; integrationIds: string[]}) => {
    const logger = getLogger();
    const {label, integrationIds} = params;

    if (!label.trim()) {
        throw new BadRequestError('Missing label');
    }

    logger.info('Creating thing', {label});

    return await withRlsTransaction({
        integrationIds,
        userName: gitgazerWriter.name, // writes require the writer role
        callback: async (tx: RdsTransaction) => {
            // const [row] = await tx.insert(things).values({label: label.trim()}).returning();
            // return row;
            return {label: label.trim()};
        },
    });
};
