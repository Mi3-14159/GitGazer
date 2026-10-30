import {describe, expect, it, vi} from 'vitest';

vi.mock('@gitgazer/backend-core/bootstrap', () => ({}));
vi.mock('@gitgazer/backend-core/config', () => ({default: {get: vi.fn(() => ['https://app.example.com'])}, loadConfig: vi.fn()}));
vi.mock('@gitgazer/db/client', () => ({db: {}, initDb: vi.fn(), withRlsTransaction: vi.fn()}));
vi.mock('@/shared/middleware/token-verifier', () => ({getVerifiers: vi.fn()}));

import {createApp} from '@/app';
import {registerMcpTools} from '@/domains/mcp/mcp.tools';
import {publicRoutePrefixes} from '@/shared/middleware/public-routes';
import {OPERATIONS, ROUTES, TOOLS} from '@/shared/permissions/table';
import type {McpServer} from '@modelcontextprotocol/server';

const tableKeys = Object.keys(ROUTES);
const appKeys = [
    ...new Set(
        createApp()
            .routes.filter((r) => r.method !== 'ALL')
            .map((r) => `${r.method} ${r.path}`),
    ),
];

const splitKey = (key: string) => {
    const [method, path] = key.split(' ');
    return {method, segments: path.split('/').filter(Boolean)};
};

// authenticate's rule: a prefix ending in `/` is a subtree, any other must match exactly or on a segment boundary
const isPublicPath = (path: string) =>
    publicRoutePrefixes.some((prefix) => (prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix || path.startsWith(`${prefix}/`)));

// `:param` matches any one segment, `:param{.+}` matches one or more
const patternsOverlap = (a: string[], b: string[]): boolean => {
    if (a.length === 0 || b.length === 0) return a.length === b.length;
    const restOf = (segments: string[]) => segments[0].includes('{.+}');
    if (restOf(a) || restOf(b)) return true;
    const sameSegment = a[0].startsWith(':') || b[0].startsWith(':') || a[0] === b[0];
    return sameSegment && patternsOverlap(a.slice(1), b.slice(1));
};

describe('permission table', () => {
    it('has a table entry for every route', () => {
        expect(appKeys.filter((key) => !(key in ROUTES))).toEqual([]);
    });

    it('has a route for every table entry', () => {
        expect(tableKeys.filter((key) => !appKeys.includes(key))).toEqual([]);
    });

    it('has a table entry for every tool and vice versa', () => {
        const names: string[] = [];
        registerMcpTools({registerTool: (name: string) => names.push(name)} as unknown as McpServer, {write: true});

        expect(names.sort()).toEqual(Object.keys(TOOLS).sort());
    });

    it('marks exactly the routes under publicPrefixes as public', () => {
        const publicByPath = tableKeys.filter((key) => isPublicPath(key.split(' ')[1]));
        const publicByAccess = tableKeys.filter((key) => OPERATIONS[ROUTES[key as keyof typeof ROUTES]].access === 'public');

        expect(publicByAccess.sort()).toEqual(publicByPath.sort());
    });

    it('puts :integrationId in every minRole route not checked in its handler', () => {
        const missing = tableKeys.filter((key) => {
            const operation: {access: unknown; checkedInHandler?: true} = OPERATIONS[ROUTES[key as keyof typeof ROUTES]];
            const needsRole = typeof operation.access === 'object' && !operation.checkedInHandler;
            return needsRole && !key.includes('/:integrationId');
        });

        expect(missing).toEqual([]);
    });

    it('marks only the two Slack callbacks as checked in the handler', () => {
        const marked = Object.entries(OPERATIONS)
            .filter(([, entry]) => 'checkedInHandler' in entry)
            .map(([name]) => name);

        expect(marked.sort()).toEqual(['slackApp.installCallback', 'slackUser.signInCallback']);
    });

    it('uses every operation', () => {
        const used = new Set<string>([...Object.values(ROUTES), ...Object.values(TOOLS)]);

        expect(Object.keys(OPERATIONS).filter((name) => !used.has(name))).toEqual([]);
    });

    it('has no two routes of the same method that match the same path', () => {
        const routes = tableKeys.map(splitKey);
        const overlaps = routes.flatMap((a, i) =>
            routes
                .slice(i + 1)
                .filter((b) => a.method === b.method && patternsOverlap(a.segments, b.segments))
                .map((b) => `${a.method} /${a.segments.join('/')} overlaps /${b.segments.join('/')}`),
        );

        expect(overlaps).toEqual([]);
    });
});
