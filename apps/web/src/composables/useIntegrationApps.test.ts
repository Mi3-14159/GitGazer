import {useIntegrationApps} from '@/composables/useIntegrationApps';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const refreshSession = vi.fn();
const resolve = vi.fn((_to: unknown) => ({href: '/integrations/int-1/members'}));

vi.mock('@/composables/useAuth', () => ({
    useAuth: () => ({fetchWithAuth: vi.fn(), refreshSession}),
}));

vi.mock('vue-router', () => ({
    useRouter: () => ({resolve}),
}));

describe('useIntegrationApps.connectSlack', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('refreshes the session and goes to the connect URL, returning to the Members tab', async () => {
        refreshSession.mockResolvedValue(true);
        const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});

        await useIntegrationApps().connectSlack('int-1');

        expect(refreshSession).toHaveBeenCalled();
        expect(resolve).toHaveBeenCalledWith({name: 'integration', params: {integrationId: 'int-1', tab: 'members'}});
        const redirectUrl = encodeURIComponent(`${window.location.origin}/integrations/int-1/members`);
        expect(assign).toHaveBeenCalledWith(`https://api.test.local/integrations/int-1/slack/connect?redirect_url=${redirectUrl}`);
        assign.mockRestore();
    });

    it('fails without leaving the page when the session cannot be refreshed', async () => {
        refreshSession.mockResolvedValue(false);
        const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});

        await expect(useIntegrationApps().connectSlack('int-1')).rejects.toThrow('Sign in again');

        expect(assign).not.toHaveBeenCalled();
        assign.mockRestore();
    });
});
