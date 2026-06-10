// Template: apps/api/src/domains/<domain>/<domain>.controller.test.ts
// Mock @gitgazer/db/client and all AWS clients — never call real services.
// The withRlsTransaction mock simply executes the callback with a synthetic tx.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@gitgazer/db/client', () => ({
    withRlsTransaction: vi.fn(async ({callback}: {callback: (tx: unknown) => Promise<unknown>}) => callback(mockTx)),
    RdsTransaction: class {},
}));

vi.mock('@gitgazer/db/schema/app', () => ({
    gitgazerWriter: {name: 'gitgazer_writer'},
}));

// Build a fake tx whose query/insert chains return fixtures.
const mockTx = {
    query: {
        things: {findMany: vi.fn(async () => [{id: 1, label: 'fixture'}])},
    },
    insert: vi.fn(() => ({
        values: vi.fn(() => ({returning: vi.fn(async () => [{id: 1, label: 'created'}])})),
    })),
};

import { createThing, getThings } from './things.controller';

describe('things.controller', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns [] when no integrations are accessible', async () => {
        expect(await getThings({integrationIds: []})).toEqual([]);
    });

    it('lists things within the RLS transaction', async () => {
        const result = await getThings({integrationIds: ['00000000-0000-0000-0000-000000000000']});
        expect(result).toEqual([{id: 1, label: 'fixture'}]);
        expect(mockTx.query.things.findMany).toHaveBeenCalledOnce();
    });

    it('rejects a blank label', async () => {
        await expect(createThing({label: '   ', integrationIds: ['00000000-0000-0000-0000-000000000000']})).rejects.toThrow();
    });
});
