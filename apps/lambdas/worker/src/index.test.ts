import type {Context, SQSEvent} from 'aws-lambda';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockProcessRecord = vi.fn();
const mockSendWorkflowJobAlerts = vi.fn();

vi.mock('@gitgazer/backend-core/bootstrap', () => ({}));
vi.mock('@gitgazer/db/client', () => ({initDb: vi.fn().mockResolvedValue(undefined)}));
vi.mock('@gitgazer/backend-core/config', () => ({
    loadConfig: vi.fn().mockResolvedValue(undefined),
    default: {get: () => ({concurrency: 5})},
}));
vi.mock('./batch-processor', () => ({
    processRecord: (...args: any[]) => mockProcessRecord(...args),
}));
vi.mock('@gitgazer/backend-services/alerting.controller', () => ({
    sendWorkflowJobAlerts: (...args: any[]) => mockSendWorkflowJobAlerts(...args),
}));

let worker: typeof import('./index');

const makeEvent = (count: number): SQSEvent => ({Records: Array.from({length: count}, (_, i) => ({messageId: `m${i}`}))}) as SQSEvent;
const makeContext = (remainingMs = 300_000): Context => ({getRemainingTimeInMillis: () => remainingMs}) as Context;

beforeEach(async () => {
    mockProcessRecord.mockReset().mockImplementation(async (record) => ({id: record.messageId}));
    mockSendWorkflowJobAlerts.mockReset().mockResolvedValue(undefined);
    worker = await import('./index');
});

describe('handler', () => {
    it('ingests records in order and starts each alert as soon as its job is saved', async () => {
        const calls: string[] = [];
        mockProcessRecord.mockImplementation(async (record) => {
            calls.push(`ingest:${record.messageId}`);
            await new Promise((resolve) => setTimeout(resolve, 1));
            return {id: record.messageId};
        });
        mockSendWorkflowJobAlerts.mockImplementation(async (job) => {
            calls.push(`alert:${job.id}`);
        });

        await worker.handler(makeEvent(3), makeContext());

        expect(calls.filter((call) => call.startsWith('ingest'))).toEqual(['ingest:m0', 'ingest:m1', 'ingest:m2']);
        expect(calls.indexOf('alert:m0')).toBeLessThan(calls.indexOf('ingest:m2'));
    });

    it('keeps alerts that already started when a later record fails ingestion', async () => {
        mockProcessRecord.mockImplementation(async (record) => {
            if (record.messageId === 'm2') throw new Error('db down');
            return {id: record.messageId};
        });

        const result = await worker.handler(makeEvent(3), makeContext());

        expect(result.batchItemFailures).toEqual([{itemIdentifier: 'm2'}]);
        expect(mockSendWorkflowJobAlerts.mock.calls.map(([job]) => job.id)).toEqual(['m0', 'm1']);
    });

    it('sends alerts with at most 5 in flight', async () => {
        let inFlight = 0;
        let maxInFlight = 0;
        mockSendWorkflowJobAlerts.mockImplementation(async () => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise((resolve) => setTimeout(resolve, 5));
            inFlight--;
        });

        await worker.handler(makeEvent(12), makeContext());

        expect(mockSendWorkflowJobAlerts).toHaveBeenCalledTimes(12);
        expect(maxInFlight).toBe(5);
    });

    it('an alert rejection does not add a batch item failure', async () => {
        mockSendWorkflowJobAlerts.mockRejectedValueOnce(new Error('slack down'));

        const result = await worker.handler(makeEvent(2), makeContext());

        expect(result.batchItemFailures).toEqual([]);
        expect(mockSendWorkflowJobAlerts).toHaveBeenCalledTimes(2);
    });

    it('only reports records whose ingestion failed and skips alerts for null results', async () => {
        mockProcessRecord.mockImplementation(async (record) => {
            if (record.messageId === 'm0') throw new Error('db down');
            if (record.messageId === 'm1') return null;
            return {id: record.messageId};
        });

        const result = await worker.handler(makeEvent(3), makeContext());

        expect(result.batchItemFailures).toEqual([{itemIdentifier: 'm0'}]);
        expect(mockSendWorkflowJobAlerts).toHaveBeenCalledTimes(1);
        expect(mockSendWorkflowJobAlerts).toHaveBeenCalledWith({id: 'm2'}, expect.any(Object));
    });

    it('sends all alerts when enrichment is skipped for low remaining time', async () => {
        const result = await worker.handler(makeEvent(10), makeContext(10_000));

        expect(mockSendWorkflowJobAlerts).toHaveBeenCalledTimes(10);
        const options = mockSendWorkflowJobAlerts.mock.calls[0][1];
        expect(options.getRemainingTimeMs()).toBe(10_000);
        expect(result.batchItemFailures).toEqual([]);
    });
});
