import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@/clients/dynamodb', () => {
    return {
        getWorkflowsBy: vi.fn(),
    };
});

let dynamodb: typeof import('@/clients/dynamodb');
let workflows: typeof import('./workflows');

describe('workflows controller', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        dynamodb = await import('@/clients/dynamodb');
        workflows = await import('./workflows');
    });

    it('getWorkflows returns [] when integrationIds is empty', async () => {
        const out = await workflows.getWorkflows({integrationIds: []});

        expect(out).toEqual([]);
        expect(dynamodb.getWorkflowsBy).not.toHaveBeenCalled();
    });

    it('getWorkflows passes integrationIds to getWorkflowsBy', async () => {
        (dynamodb.getWorkflowsBy as any).mockResolvedValue([
            {items: [], lastEvaluatedKey: undefined},
        ]);

        await workflows.getWorkflows({
            integrationIds: ['integration1', 'integration2'],
        });

        expect(dynamodb.getWorkflowsBy).toHaveBeenCalledTimes(1);
        expect(dynamodb.getWorkflowsBy).toHaveBeenCalledWith({
            keys: [{integrationId: 'integration1'}, {integrationId: 'integration2'}],
        });
    });

    it('getWorkflows caps limit at 1000', async () => {
        (dynamodb.getWorkflowsBy as any).mockResolvedValue([
            {items: [], lastEvaluatedKey: undefined},
        ]);

        await workflows.getWorkflows({
            integrationIds: ['integration1'],
            limit: 2000,
        });

        expect(dynamodb.getWorkflowsBy).toHaveBeenCalledWith({
            keys: [{integrationId: 'integration1'}],
            limit: 1000,
        });
    });

    it('getWorkflows passes limit when under cap', async () => {
        (dynamodb.getWorkflowsBy as any).mockResolvedValue([
            {items: [], lastEvaluatedKey: undefined},
        ]);

        await workflows.getWorkflows({
            integrationIds: ['integration1'],
            limit: 500,
        });

        expect(dynamodb.getWorkflowsBy).toHaveBeenCalledWith({
            keys: [{integrationId: 'integration1'}],
            limit: 500,
        });
    });

    it('getWorkflows passes limit of exactly 1000 without modification', async () => {
        (dynamodb.getWorkflowsBy as any).mockResolvedValue([
            {items: [], lastEvaluatedKey: undefined},
        ]);

        await workflows.getWorkflows({
            integrationIds: ['integration1'],
            limit: 1000,
        });

        expect(dynamodb.getWorkflowsBy).toHaveBeenCalledWith({
            keys: [{integrationId: 'integration1'}],
            limit: 1000,
        });
    });

    it('getWorkflows does not pass limit when undefined', async () => {
        (dynamodb.getWorkflowsBy as any).mockResolvedValue([
            {items: [], lastEvaluatedKey: undefined},
        ]);

        await workflows.getWorkflows({
            integrationIds: ['integration1'],
        });

        expect(dynamodb.getWorkflowsBy).toHaveBeenCalledWith({
            keys: [{integrationId: 'integration1'}],
        });
    });

    it('getWorkflows handles limit of 0', async () => {
        (dynamodb.getWorkflowsBy as any).mockResolvedValue([
            {items: [], lastEvaluatedKey: undefined},
        ]);

        await workflows.getWorkflows({
            integrationIds: ['integration1'],
            limit: 0,
        });

        // A limit of 0 is treated as no limit specified
        expect(dynamodb.getWorkflowsBy).toHaveBeenCalledWith({
            keys: [{integrationId: 'integration1'}],
        });
    });

    it('getWorkflows passes projection parameter', async () => {
        (dynamodb.getWorkflowsBy as any).mockResolvedValue([
            {items: [], lastEvaluatedKey: undefined},
        ]);

        await workflows.getWorkflows({
            integrationIds: ['integration1'],
            projection: 'FULL',
        });

        expect(dynamodb.getWorkflowsBy).toHaveBeenCalledWith({
            keys: [{integrationId: 'integration1'}],
            projection: 'FULL',
        });
    });

    it('getWorkflows passes exclusiveStartKeys parameter', async () => {
        (dynamodb.getWorkflowsBy as any).mockResolvedValue([
            {items: [], lastEvaluatedKey: undefined},
        ]);

        const exclusiveStartKeys = [{integrationId: 'integration1', id: 'key1'}];

        await workflows.getWorkflows({
            integrationIds: ['integration1'],
            exclusiveStartKeys,
        });

        expect(dynamodb.getWorkflowsBy).toHaveBeenCalledWith({
            keys: [{integrationId: 'integration1'}],
            exclusiveStartKeys,
        });
    });

    it('getWorkflows passes all parameters together', async () => {
        (dynamodb.getWorkflowsBy as any).mockResolvedValue([
            {items: [], lastEvaluatedKey: undefined},
        ]);

        const exclusiveStartKeys = [{integrationId: 'integration1', id: 'key1'}];

        await workflows.getWorkflows({
            integrationIds: ['integration1', 'integration2'],
            limit: 750,
            projection: 'FULL',
            exclusiveStartKeys,
        });

        expect(dynamodb.getWorkflowsBy).toHaveBeenCalledWith({
            keys: [{integrationId: 'integration1'}, {integrationId: 'integration2'}],
            limit: 750,
            projection: 'FULL',
            exclusiveStartKeys,
        });
    });

    it('getWorkflows returns data from getWorkflowsBy', async () => {
        const mockData = [
            {items: [{id: 'workflow1'}], lastEvaluatedKey: {id: 'key1'}},
            {items: [{id: 'workflow2'}], lastEvaluatedKey: undefined},
        ];

        (dynamodb.getWorkflowsBy as any).mockResolvedValue(mockData);

        const result = await workflows.getWorkflows({
            integrationIds: ['integration1'],
        });

        expect(result).toEqual(mockData);
    });
});
