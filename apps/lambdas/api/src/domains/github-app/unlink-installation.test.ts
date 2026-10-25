import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockDeprovision = vi.fn();
vi.mock('@/domains/github-app/webhook-provisioning', () => ({
    deprovisionAllWebhooks: (...args: unknown[]) => mockDeprovision(...args),
}));

const mockCreateEventLogEntry = vi.fn();
vi.mock('@gitgazer/backend-services/event-log.controller', () => ({
    createEventLogEntry: (...args: unknown[]) => mockCreateEventLogEntry(...args),
}));

const mockLoggerError = vi.fn();
vi.mock('@gitgazer/backend-core/logger', () => ({
    getLogger: () => ({error: mockLoggerError, info: vi.fn(), warn: vi.fn(), debug: vi.fn()}),
}));

const mockSet = vi.fn();
const mockWhere = vi.fn();
vi.mock('@gitgazer/db/client', () => ({
    db: {
        update: () => ({
            set: (values: unknown) => {
                mockSet(values);
                return {where: mockWhere};
            },
        }),
    },
}));

vi.mock('@gitgazer/db/schema/github/workflows', () => ({
    githubAppInstallations: {installationId: Symbol('installationId'), integrationId: Symbol('integrationId')},
}));

let unlinkInstallation: typeof import('./unlink-installation').unlinkInstallation;

describe('unlinkInstallation', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockDeprovision.mockResolvedValue(undefined);
        mockWhere.mockResolvedValue(undefined);
        mockCreateEventLogEntry.mockResolvedValue({});
        ({unlinkInstallation} = await import('./unlink-installation'));
    });

    it('deprovisions, unlinks and logs', async () => {
        await unlinkInstallation('int-1', 42);

        expect(mockDeprovision).toHaveBeenCalledWith('int-1', 42);
        expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({integrationId: null}));
        expect(mockWhere).toHaveBeenCalled();
        expect(mockCreateEventLogEntry).toHaveBeenCalledWith(
            expect.objectContaining({integrationId: 'int-1', category: 'integration', type: 'info', title: 'GitHub App unlinked'}),
        );
    });

    it('still unlinks when deprovisioning fails', async () => {
        mockDeprovision.mockRejectedValue(new Error('github down'));

        await unlinkInstallation('int-1', 42);

        expect(mockLoggerError).toHaveBeenCalled();
        expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({integrationId: null}));
        expect(mockCreateEventLogEntry).toHaveBeenCalled();
    });

    it('does not throw when the event log write fails', async () => {
        mockCreateEventLogEntry.mockRejectedValue(new Error('db down'));

        await expect(unlinkInstallation('int-1', 42)).resolves.toBeUndefined();

        expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({integrationId: null}));
        expect(mockLoggerError).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({integrationId: 'int-1', installationId: 42, error: expect.any(Error)}),
        );
    });
});
