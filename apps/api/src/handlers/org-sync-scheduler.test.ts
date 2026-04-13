import {beforeEach, describe, expect, it, vi} from 'vitest';

// ---- Mocks ----

const mockSendOrgMemberSyncTask = vi.fn();

vi.mock('@/shared/clients/sqs.client', () => ({
    sendOrgMemberSyncTask: (...args: any[]) => mockSendOrgMemberSyncTask(...args),
}));

vi.mock('@/shared/config', () => {
    const mockGet = vi.fn().mockReturnValue('https://sqs.queue.url');
    return {
        loadConfig: vi.fn(),
        default: {get: mockGet},
    };
});

const mockDb = {
    select: vi.fn(),
};

vi.mock('@gitgazer/db/client', () => ({
    db: mockDb,
    initDb: vi.fn(),
}));

vi.mock('@gitgazer/db/schema/github/workflows', () => ({
    githubAppInstallations: {
        installationId: Symbol('installationId'),
        accountLogin: Symbol('accountLogin'),
        accountType: Symbol('accountType'),
    },
}));

let handler: typeof import('./org-sync-scheduler');

describe('org-sync-scheduler handler', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        mockSendOrgMemberSyncTask.mockResolvedValue(undefined);
        handler = await import('./org-sync-scheduler');
    });

    it('dispatches SQS tasks for all Organization installations', async () => {
        const installations = [
            {installationId: 1, accountLogin: 'org-a'},
            {installationId: 2, accountLogin: 'org-b'},
        ];

        mockDb.select.mockReturnValue({
            from: () => ({
                where: () => Promise.resolve(installations),
            }),
        });

        await handler.handler();

        expect(mockSendOrgMemberSyncTask).toHaveBeenCalledTimes(2);
        expect(mockSendOrgMemberSyncTask).toHaveBeenCalledWith('https://sqs.queue.url', {
            taskType: 'org_member_sync',
            installationId: 1,
            accountLogin: 'org-a',
        });
        expect(mockSendOrgMemberSyncTask).toHaveBeenCalledWith('https://sqs.queue.url', {
            taskType: 'org_member_sync',
            installationId: 2,
            accountLogin: 'org-b',
        });
    });

    it('handles empty installation list', async () => {
        mockDb.select.mockReturnValue({
            from: () => ({
                where: () => Promise.resolve([]),
            }),
        });

        await handler.handler();

        expect(mockSendOrgMemberSyncTask).not.toHaveBeenCalled();
    });

    it('continues dispatching when individual tasks fail', async () => {
        const installations = [
            {installationId: 1, accountLogin: 'org-a'},
            {installationId: 2, accountLogin: 'org-b'},
            {installationId: 3, accountLogin: 'org-c'},
        ];

        mockDb.select.mockReturnValue({
            from: () => ({
                where: () => Promise.resolve(installations),
            }),
        });

        mockSendOrgMemberSyncTask
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('SQS send failed'))
            .mockResolvedValueOnce(undefined);

        await handler.handler();

        // Should have attempted all 3
        expect(mockSendOrgMemberSyncTask).toHaveBeenCalledTimes(3);
    });
});
