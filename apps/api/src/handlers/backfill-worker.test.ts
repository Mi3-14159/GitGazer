import type {SQSEvent} from 'aws-lambda';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {GitHubApiError} from '@/domains/backfill/github';

const mockRouteTask = vi.fn();
const mockSendBackfillTasks = vi.fn();
const mockParseTask = vi.fn();
const mockParseInitialTask = vi.fn();
const mockChangeMessageVisibility = vi.fn();

vi.mock('@/domains/backfill/router', () => ({
    routeTask: (...args: any[]) => mockRouteTask(...args),
}));

vi.mock('@/domains/backfill/queue', () => ({
    sendBackfillTasks: (...args: any[]) => mockSendBackfillTasks(...args),
}));

vi.mock('@/domains/backfill/tasks', () => ({
    parseTask: (...args: any[]) => mockParseTask(...args),
    parseInitialTask: (...args: any[]) => mockParseInitialTask(...args),
}));

vi.mock('@/shared/clients/sqs.client', () => ({
    changeMessageVisibility: (...args: any[]) => mockChangeMessageVisibility(...args),
}));

vi.mock('@/shared/config', () => ({
    default: {get: vi.fn(() => 'https://sqs.test/backfill-queue')},
    loadConfig: vi.fn(),
}));

vi.mock('@gitgazer/db/client', () => ({
    initDb: vi.fn(),
}));

let handlerModule: typeof import('./backfill-worker');

const sqsEvent = (bodies: {body: string; messageId: string}[]): SQSEvent =>
    ({Records: bodies.map((b) => ({body: b.body, messageId: b.messageId}))}) as unknown as SQSEvent;

describe('backfill-worker handler', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockSendBackfillTasks.mockResolvedValue(undefined);
        handlerModule = await import('./backfill-worker');
    });

    it('seeds the queue on direct invoke', async () => {
        const initial = {kind: 'discover', integrationId: 'int-1', owner: 'acme', eventTypes: ['workflow_run']};
        mockParseInitialTask.mockReturnValue(initial);

        const result = await handlerModule.handler({...initial});

        expect(result).toBeUndefined();
        expect(mockParseInitialTask).toHaveBeenCalled();
        expect(mockSendBackfillTasks).toHaveBeenCalledWith([initial]);
        expect(mockRouteTask).not.toHaveBeenCalled();
    });

    it('routes each SQS record and enqueues follow-ups', async () => {
        const task = {kind: 'repo', integrationId: 'int-1', owner: 'acme', repo: 'web', eventTypes: ['workflow_run']};
        const followUps = [{kind: 'runs_page'}];
        mockParseTask.mockReturnValue(task);
        mockRouteTask.mockResolvedValue(followUps);

        const result = await handlerModule.handler(sqsEvent([{body: JSON.stringify(task), messageId: 'm1'}]));

        expect(result).toEqual({batchItemFailures: []});
        expect(mockRouteTask).toHaveBeenCalledWith(task);
        expect(mockSendBackfillTasks).toHaveBeenCalledWith(followUps);
    });

    it('reports a batch item failure when a task throws', async () => {
        mockParseTask.mockReturnValue({kind: 'repo'});
        mockRouteTask.mockRejectedValue(new Error('boom'));

        const result = await handlerModule.handler(sqsEvent([{body: '{}', messageId: 'm-fail'}]));

        expect(result).toEqual({batchItemFailures: [{itemIdentifier: 'm-fail'}]});
        expect(mockChangeMessageVisibility).not.toHaveBeenCalled();
    });

    it('defers a rate-limited task until the limit resets by extending its visibility timeout', async () => {
        mockParseTask.mockReturnValue({kind: 'workflow_run'});
        mockRouteTask.mockRejectedValue(new GitHubApiError('rate limited', 403, 1_800_000)); // 30 min reset

        const event = {Records: [{body: '{}', messageId: 'm-rl', receiptHandle: 'rh-rl'}]} as unknown as SQSEvent;
        const result = await handlerModule.handler(event);

        expect(mockChangeMessageVisibility).toHaveBeenCalledWith('https://sqs.test/backfill-queue', 'rh-rl', 1800);
        expect(result).toEqual({batchItemFailures: [{itemIdentifier: 'm-rl'}]});
    });

    it('caps a deferral at the SQS 12-hour visibility maximum', async () => {
        mockParseTask.mockReturnValue({kind: 'workflow_run'});
        mockRouteTask.mockRejectedValue(new GitHubApiError('rate limited', 403, 24 * 60 * 60 * 1000)); // 24h > cap

        const event = {Records: [{body: '{}', messageId: 'm-cap', receiptHandle: 'rh-cap'}]} as unknown as SQSEvent;
        await handlerModule.handler(event);

        expect(mockChangeMessageVisibility).toHaveBeenCalledWith('https://sqs.test/backfill-queue', 'rh-cap', 12 * 60 * 60);
    });

    it('still reports the batch failure when extending visibility fails', async () => {
        mockParseTask.mockReturnValue({kind: 'workflow_run'});
        mockRouteTask.mockRejectedValue(new GitHubApiError('rate limited', 403, 60_000));
        mockChangeMessageVisibility.mockRejectedValue(new Error('receipt handle expired'));

        const event = {Records: [{body: '{}', messageId: 'm-err', receiptHandle: 'rh-err'}]} as unknown as SQSEvent;
        const result = await handlerModule.handler(event);

        expect(result).toEqual({batchItemFailures: [{itemIdentifier: 'm-err'}]});
    });

    it('does not extend visibility for a GitHubApiError without a reset wait', async () => {
        mockParseTask.mockReturnValue({kind: 'workflow_run'});
        mockRouteTask.mockRejectedValue(new GitHubApiError('not found', 404)); // no retryAfterMs

        const event = {Records: [{body: '{}', messageId: 'm-404', receiptHandle: 'rh-404'}]} as unknown as SQSEvent;
        const result = await handlerModule.handler(event);

        expect(mockChangeMessageVisibility).not.toHaveBeenCalled();
        expect(result).toEqual({batchItemFailures: [{itemIdentifier: 'm-404'}]});
    });

    it('isolates failures to the offending record', async () => {
        const okTask = {kind: 'repo'};
        mockParseTask.mockImplementation((body: any) => {
            if (body.bad) throw new Error('parse error');
            return okTask;
        });
        mockRouteTask.mockResolvedValue([]);

        const result = await handlerModule.handler(
            sqsEvent([
                {body: JSON.stringify({bad: false}), messageId: 'ok'},
                {body: JSON.stringify({bad: true}), messageId: 'bad'},
            ]),
        );

        expect(result).toEqual({batchItemFailures: [{itemIdentifier: 'bad'}]});
    });
});
