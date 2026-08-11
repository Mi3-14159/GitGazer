import {inspect} from 'node:util';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockWithRlsTransaction = vi.fn();
const mockFetchRepo = vi.fn();

vi.mock('@gitgazer/db/client', () => ({
    withRlsTransaction: (...args: any[]) => mockWithRlsTransaction(...args),
}));

vi.mock('./github', () => ({
    fetchRepo: (...args: any[]) => mockFetchRepo(...args),
}));

import {getStoredRepository, resolveRepo} from './stored-repo';

/** Serialize a Drizzle condition so assertions can see column names + bound params (which surface at depth). */
const sqlToString = (value: unknown): string => inspect(value, {depth: 10, maxStringLength: Infinity});

// Join/where predicates captured from the query builder so tests can assert the
// lookup is scoped correctly. Reset by `stubRows` before each stubbed call.
let capturedConditions: {innerJoin: unknown[]; leftJoin: unknown[]; where: unknown[]};

// Minimal drizzle query-builder stand-in: every chained method returns the same
// object so the real callback builds without a database, `limit` resolves the
// canned rows, and the join/where predicates are recorded for inspection.
const fakeTx = (rows: unknown[]) => {
    const chain: any = {
        select: () => chain,
        from: () => chain,
        innerJoin: (_table: unknown, condition: unknown) => {
            capturedConditions.innerJoin.push(condition);
            return chain;
        },
        leftJoin: (_table: unknown, condition: unknown) => {
            capturedConditions.leftJoin.push(condition);
            return chain;
        },
        where: (condition: unknown) => {
            capturedConditions.where.push(condition);
            return chain;
        },
        limit: () => Promise.resolve(rows),
    };
    return chain;
};

const stubRows = (rows: unknown[]) => {
    capturedConditions = {innerJoin: [], leftJoin: [], where: []};
    mockWithRlsTransaction.mockImplementation(async ({callback}: any) => callback(fakeTx(rows)));
};

const storedRow = {
    id: 42,
    name: 'web',
    private: true,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-06-01T00:00:00Z'),
    defaultBranch: 'main',
    topics: ['ci'],
    ownerId: 7,
    ownerLogin: 'acme',
    ownerType: 'Organization',
    orgId: 99,
    orgLogin: 'acme',
    orgDescription: 'ACME Corp',
};

describe('getStoredRepository', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns null when the repository is not stored', async () => {
        stubRows([]);
        expect(await getStoredRepository('int-1', 'acme', 'web')).toBeNull();
    });

    it('scopes the read to the task integration', async () => {
        stubRows([]);
        await getStoredRepository('int-1', 'acme', 'web');
        expect(mockWithRlsTransaction).toHaveBeenCalledWith(expect.objectContaining({integrationIds: ['int-1']}));
    });

    it('filters by integration, repo name, and owner login', async () => {
        stubRows([]);
        await getStoredRepository('int-1', 'octo-org', 'web-app');

        // The owner is matched by login (not by repo name alone) so two repos that
        // share a short name under different owners in one integration cannot collide.
        const whereSql = capturedConditions.where.map(sqlToString).join(' ');
        expect(whereSql).toContain('login');
        expect(whereSql).toContain('octo-org');
        expect(whereSql).toContain('web-app');
        expect(whereSql).toContain('integration_id');
        expect(whereSql).toContain('int-1');

        // The owner is required (inner join) but the organization is optional (left
        // join) so user-owned repositories are not filtered out of the result.
        expect(capturedConditions.innerJoin.map(sqlToString).join(' ')).toContain('owner_id');
        expect(capturedConditions.leftJoin.map(sqlToString).join(' ')).toContain('organization_id');
    });

    it('rebuilds the GitHub repo shape from stored rows, including the organization', async () => {
        stubRows([storedRow]);
        const repo = await getStoredRepository('int-1', 'acme', 'web');
        expect(repo).toEqual({
            id: 42,
            name: 'web',
            private: true,
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-06-01T00:00:00.000Z',
            default_branch: 'main',
            topics: ['ci'],
            owner: {id: 7, login: 'acme', type: 'Organization'},
            organization: {id: 99, login: 'acme', description: 'ACME Corp'},
        });
    });

    it('omits the organization for a user-owned repository', async () => {
        stubRows([{...storedRow, orgId: null, orgLogin: null, orgDescription: null}]);
        const repo = await getStoredRepository('int-1', 'acme', 'web');
        expect(repo?.organization).toBeUndefined();
    });
});

describe('resolveRepo', () => {
    beforeEach(() => vi.clearAllMocks());

    it('reuses the stored repository without calling GitHub', async () => {
        stubRows([storedRow]);
        const repo = await resolveRepo('int-1', 'acme', 'reuse-me', 'pat');
        expect(mockFetchRepo).not.toHaveBeenCalled();
        expect((repo as {id: number}).id).toBe(42);
    });

    it('falls back to a GitHub fetch when the repository is absent', async () => {
        stubRows([]);
        mockFetchRepo.mockResolvedValue({id: 1, name: 'fetch-me'});
        const repo = await resolveRepo('int-1', 'acme', 'fetch-me', 'pat');
        expect(mockFetchRepo).toHaveBeenCalledWith('acme', 'fetch-me', 'pat');
        expect((repo as {name: string}).name).toBe('fetch-me');
    });

    it('caches the resolved repository per container', async () => {
        stubRows([]);
        mockFetchRepo.mockResolvedValue({id: 2, name: 'cache-me'});
        await resolveRepo('int-1', 'acme', 'cache-me', 'pat');
        await resolveRepo('int-1', 'acme', 'cache-me', 'pat');
        expect(mockFetchRepo).toHaveBeenCalledTimes(1);
    });
});
