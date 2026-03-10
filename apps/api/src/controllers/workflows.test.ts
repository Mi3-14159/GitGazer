import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@gitgazer/db/client', () => {
    return {
        withRlsTransaction: vi.fn(),
    };
});

const mockWorkflowRun = (overrides: Partial<{integrationId: string; id: number; createdAt: Date; workflowJobs: any[]}> = {}) => ({
    integrationId: 'int-1',
    repositoryId: 1,
    id: 100,
    actorId: 1,
    conclusion: 'success' as const,
    createdAt: new Date('2026-03-03T00:00:00Z'),
    headBranch: 'main',
    name: 'CI',
    runAttempt: 1,
    status: 'completed',
    runStartedAt: new Date('2026-03-03T00:00:00Z'),
    updatedAt: new Date('2026-03-03T00:00:00Z'),
    workflowId: 1,
    headCommitAuthorName: 'test',
    headCommitMessage: 'test commit',
    workflowJobs: [],
    repository: {
        name: 'my-repo',
        organization: {login: 'my-org'},
    },
    ...overrides,
});

let rds: typeof import('@gitgazer/db/client');
let workflows: typeof import('./workflows');

describe('workflows controller', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        rds = await import('@gitgazer/db/client');
        workflows = await import('./workflows');
    });

    it('returns empty response when integrationIds is empty', async () => {
        const out = await workflows.getWorkflows({integrationIds: []});

        expect(out).toEqual({items: [], cursor: undefined});
        expect(rds.withRlsTransaction).not.toHaveBeenCalled();
    });

    it('returns cursor when results fill the limit', async () => {
        const mockRuns = Array.from({length: 3}, (_, i) =>
            mockWorkflowRun({
                id: 100 - i,
                createdAt: new Date(`2026-03-0${3 - i}T00:00:00Z`),
            }),
        );

        (rds.withRlsTransaction as any).mockImplementation(async (params: {integrationIds: string[]; callback: Function}) => {
            const tx = {
                query: {
                    workflowRuns: {
                        findMany: vi.fn().mockResolvedValue(mockRuns),
                    },
                },
            };
            return params.callback(tx);
        });

        const result = await workflows.getWorkflows({
            integrationIds: ['int-1'],
            limit: 3,
        });

        expect(result.items).toHaveLength(3);
        expect(result.cursor).toEqual({
            createdAt: '2026-03-01T00:00:00.000Z',
            id: 98,
        });
    });

    it('returns no cursor when fewer results than limit', async () => {
        const mockRuns = [mockWorkflowRun()];

        (rds.withRlsTransaction as any).mockImplementation(async (params: {integrationIds: string[]; callback: Function}) => {
            const tx = {
                query: {
                    workflowRuns: {
                        findMany: vi.fn().mockResolvedValue(mockRuns),
                    },
                },
            };
            return params.callback(tx);
        });

        const result = await workflows.getWorkflows({
            integrationIds: ['int-1'],
            limit: 10,
        });

        expect(result.items).toHaveLength(1);
        expect(result.cursor).toBeUndefined();
    });

    it('returns items across multiple integrations in a flat list', async () => {
        const mockRuns = [
            mockWorkflowRun({integrationId: 'int-1', id: 100, createdAt: new Date('2026-03-03T00:00:00Z')}),
            mockWorkflowRun({integrationId: 'int-2', id: 200, createdAt: new Date('2026-03-02T00:00:00Z')}),
        ];

        (rds.withRlsTransaction as any).mockImplementation(async (params: {integrationIds: string[]; callback: Function}) => {
            const tx = {
                query: {
                    workflowRuns: {
                        findMany: vi.fn().mockResolvedValue(mockRuns),
                    },
                },
            };
            return params.callback(tx);
        });

        const result = await workflows.getWorkflows({
            integrationIds: ['int-1', 'int-2'],
            limit: 100,
        });

        expect(result.items).toHaveLength(2);
        expect(result.items[0].integrationId).toBe('int-1');
        expect(result.items[1].integrationId).toBe('int-2');
        // Fewer than limit, so no cursor
        expect(result.cursor).toBeUndefined();
    });

    it('caps limit at 100', async () => {
        let capturedOptions: any;
        (rds.withRlsTransaction as any).mockImplementation(async (params: {integrationIds: string[]; callback: Function}) => {
            const tx = {
                query: {
                    workflowRuns: {
                        findMany: vi.fn().mockImplementation((opts: any) => {
                            capturedOptions = opts;
                            return [];
                        }),
                    },
                },
            };
            return params.callback(tx);
        });

        await workflows.getWorkflows({
            integrationIds: ['int-1'],
            limit: 500,
        });

        expect(capturedOptions.limit).toBe(50);
    });

    it('passes where condition when cursor is provided', async () => {
        let capturedOptions: any;
        (rds.withRlsTransaction as any).mockImplementation(async (params: {integrationIds: string[]; callback: Function}) => {
            const tx = {
                query: {
                    workflowRuns: {
                        findMany: vi.fn().mockImplementation((opts: any) => {
                            capturedOptions = opts;
                            return [];
                        }),
                    },
                },
            };
            return params.callback(tx);
        });

        await workflows.getWorkflows({
            integrationIds: ['int-1'],
            limit: 10,
            cursor: {createdAt: '2026-03-01T00:00:00Z', id: 50},
        });

        expect(capturedOptions.where).toBeDefined();
    });

    it('does not set where condition when no cursor is provided', async () => {
        let capturedOptions: any;
        (rds.withRlsTransaction as any).mockImplementation(async (params: {integrationIds: string[]; callback: Function}) => {
            const tx = {
                query: {
                    workflowRuns: {
                        findMany: vi.fn().mockImplementation((opts: any) => {
                            capturedOptions = opts;
                            return [];
                        }),
                    },
                },
            };
            return params.callback(tx);
        });

        await workflows.getWorkflows({
            integrationIds: ['int-1'],
            limit: 10,
        });

        expect(capturedOptions.where).toBeUndefined();
    });
});
