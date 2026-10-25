import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockDeprovision = vi.fn();
vi.mock('@/domains/github-app/webhook-provisioning', () => ({
    deprovisionWebhooks: (...args: unknown[]) => mockDeprovision(...args),
}));

const mockCreateEventLogEntry = vi.fn();
vi.mock('@gitgazer/backend-services/event-log.controller', () => ({
    createEventLogEntry: (...args: unknown[]) => mockCreateEventLogEntry(...args),
}));

const mockLoggerError = vi.fn();
vi.mock('@gitgazer/backend-core/logger', () => ({
    getLogger: () => ({error: mockLoggerError, info: vi.fn(), warn: vi.fn(), debug: vi.fn()}),
}));

const RECORDED = [{webhookId: 99, targetType: 'organization', targetName: 'my-org'}];

const mockSet = vi.fn();
const mockWhere = vi.fn();
const mockSelectWhere = vi.fn();
const mockTx = {
    update: () => ({
        set: (values: unknown) => {
            mockSet(values);
            return {where: mockWhere};
        },
    }),
    select: () => ({from: () => ({where: mockSelectWhere})}),
};
const mockTransaction = vi.fn(async (callback: (tx: typeof mockTx) => unknown) => await callback(mockTx));
vi.mock('@gitgazer/db/client', () => ({db: {transaction: mockTransaction}}));

vi.mock('@gitgazer/db/schema/github/workflows', () => ({
    githubAppInstallations: {installationId: Symbol('installationId'), integrationId: Symbol('integrationId')},
    githubAppWebhooks: {
        installationId: Symbol('installationId'),
        integrationId: Symbol('integrationId'),
        webhookId: Symbol('webhookId'),
        targetType: Symbol('targetType'),
        targetName: Symbol('targetName'),
    },
}));

let unlinkInstallation: typeof import('./unlink-installation').unlinkInstallation;

describe('unlinkInstallation', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockDeprovision.mockResolvedValue(undefined);
        mockWhere.mockResolvedValue(undefined);
        mockSelectWhere.mockResolvedValue(RECORDED);
        mockCreateEventLogEntry.mockResolvedValue({});
        ({unlinkInstallation} = await import('./unlink-installation'));
    });

    it('detaches the installation before deprovisioning its webhooks', async () => {
        await unlinkInstallation('int-1', 42);

        expect(mockWhere).toHaveBeenCalledTimes(1);
        expect(mockDeprovision).toHaveBeenCalledTimes(1);
        expect(mockWhere.mock.invocationCallOrder[0]).toBeLessThan(mockDeprovision.mock.invocationCallOrder[0]);
    });

    it('reads the recorded webhooks in the detaching transaction and deprovisions exactly those', async () => {
        await unlinkInstallation('int-1', 42);

        expect(mockTransaction).toHaveBeenCalledTimes(1);
        expect(mockWhere.mock.invocationCallOrder[0]).toBeLessThan(mockSelectWhere.mock.invocationCallOrder[0]);
        // A re-link recording webhooks while deprovisioning runs is not in this snapshot, so its rows stay
        expect(mockDeprovision).toHaveBeenCalledWith('int-1', 42, RECORDED);
    });

    it('does not deprovision when detaching fails', async () => {
        mockWhere.mockRejectedValue(new Error('db down'));

        await expect(unlinkInstallation('int-1', 42)).rejects.toThrow('db down');

        expect(mockDeprovision).not.toHaveBeenCalled();
    });

    it('unlinks, deprovisions and logs', async () => {
        await unlinkInstallation('int-1', 42);

        expect(mockDeprovision).toHaveBeenCalledWith('int-1', 42, RECORDED);
        expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({integrationId: null}));
        expect(mockWhere).toHaveBeenCalled();
        expect(mockCreateEventLogEntry).toHaveBeenCalledWith(
            expect.objectContaining({integrationId: 'int-1', category: 'integration', type: 'info', title: 'GitHub App unlinked'}),
        );
    });

    it('still unlinks when deprovisioning fails', async () => {
        mockDeprovision.mockRejectedValue(new Error('github down'));

        await unlinkInstallation('int-1', 42);

        expect(mockLoggerError).toHaveBeenCalledWith(
            'Failed to deprovision webhooks',
            expect.objectContaining({integrationId: 'int-1', installationId: 42, error: expect.any(Error)}),
        );
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
