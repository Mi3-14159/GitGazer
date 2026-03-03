import {BadRequestError} from '@aws-lambda-powertools/event-handler/http';
import {EventPayloadMap} from '@common/types';
import type {EmitterWebhookEventName} from '@octokit/webhooks';
import {describe, expect, it, vi} from 'vitest';

// Mock dependencies
vi.mock('@/clients/dynamodb', () => ({
    putEvent: vi.fn(),
}));

vi.mock('@/clients/websocket-connections', () => ({
    deleteConnection: vi.fn(),
    getConnections: vi.fn(),
}));

vi.mock('@aws-sdk/client-apigatewaymanagementapi', () => ({
    ApiGatewayManagementApiClient: vi.fn(),
    ApiGatewayManagementApiServiceException: class ApiGatewayManagementApiServiceException extends Error {
        $metadata = {httpStatusCode: 500};
    },
    GoneException: class GoneException extends Error {},
    PostToConnectionCommand: vi.fn(),
}));

// Import the module - getEventId is exported
import {getEventId} from './imports';

describe('getEventId', () => {
    describe('workflow_job event type', () => {
        it('generates ID with workflow_job/job_id format', () => {
            const event: EventPayloadMap['workflow_job'] = {
                workflow_job: {
                    run_id: 12345,
                    id: 67890,
                } as any,
            } as any;

            const result = getEventId('workflow_job', event);

            expect(result).toBe('workflow_job/67890');
        });

        it('handles zero values in workflow_job IDs', () => {
            const event: EventPayloadMap['workflow_job'] = {
                workflow_job: {
                    run_id: 0,
                    id: 0,
                } as any,
            } as any;

            const result = getEventId('workflow_job', event);

            expect(result).toBe('workflow_job/0');
        });

        it('handles large numeric IDs in workflow_job', () => {
            const event: EventPayloadMap['workflow_job'] = {
                workflow_job: {
                    run_id: 999999999999,
                    id: 888888888888,
                } as any,
            } as any;

            const result = getEventId('workflow_job', event);

            expect(result).toBe('workflow_job/888888888888');
        });
    });

    describe('workflow_run event type', () => {
        it('generates ID with workflow_run/run_id format', () => {
            const event: EventPayloadMap['workflow_run'] = {
                workflow_run: {
                    id: 54321,
                } as any,
            } as any;

            const result = getEventId('workflow_run', event);

            expect(result).toBe('workflow_run/54321');
        });

        it('handles zero value in workflow_run ID', () => {
            const event: EventPayloadMap['workflow_run'] = {
                workflow_run: {
                    id: 0,
                } as any,
            } as any;

            const result = getEventId('workflow_run', event);

            expect(result).toBe('workflow_run/0');
        });

        it('handles large numeric ID in workflow_run', () => {
            const event: EventPayloadMap['workflow_run'] = {
                workflow_run: {
                    id: 777777777777,
                } as any,
            } as any;

            const result = getEventId('workflow_run', event);

            expect(result).toBe('workflow_run/777777777777');
        });
    });

    describe('validation and error handling', () => {
        it('throws BadRequestError when event type property is missing', () => {
            const event = {} as any;

            expect(() => getEventId('workflow_job', event)).toThrow(BadRequestError);
            expect(() => getEventId('workflow_job', event)).toThrow('Event payload does not contain expected property for event type workflow_job');
        });

        it('throws BadRequestError when event type property is null', () => {
            const event = {workflow_job: null} as any;

            expect(() => getEventId('workflow_job', event)).toThrow(BadRequestError);
            expect(() => getEventId('workflow_job', event)).toThrow('Event payload does not contain expected property for event type workflow_job');
        });

        it('throws BadRequestError when event type property has no id', () => {
            const event = {workflow_job: {name: 'test'}} as any;

            expect(() => getEventId('workflow_job', event)).toThrow(BadRequestError);
            expect(() => getEventId('workflow_job', event)).toThrow("Event payload for event type workflow_job does not contain an 'id' property");
        });

        it('throws BadRequestError for unsupported event type', () => {
            const event = {} as any;
            const unsupportedEventType = 'push' as EmitterWebhookEventName & keyof EventPayloadMap;

            expect(() => getEventId(unsupportedEventType, event)).toThrow(BadRequestError);
            expect(() => getEventId(unsupportedEventType, event)).toThrow('Event payload does not contain expected property for event type push');
        });
    });
});
