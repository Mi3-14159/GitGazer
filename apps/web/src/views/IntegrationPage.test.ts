import IntegrationPage from '@/views/IntegrationPage.vue';
import router from '@/router';
import type {MemberRole} from '@common/types';
import {flushPromises, mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ref, type Component} from 'vue';
import {createMemoryHistory, createRouter} from 'vue-router';

let role: MemberRole = 'owner';

vi.mock('@/composables/useIntegration', () => ({
    useIntegration: () => ({
        getIntegrations: vi.fn(async () => [
            {integrationId: 'int-1', label: 'Platform', role, createdAt: '', githubAppInstallations: []},
            {integrationId: 'int-2', label: 'Payments', role, createdAt: '', githubAppInstallations: []},
        ]),
        isLoadingIntegrations: ref(false),
        createIntegration: vi.fn(),
        updateIntegration: vi.fn(),
        deleteIntegration: vi.fn(),
        rotateSecret: vi.fn(),
        updateOrgSyncDefaultRole: vi.fn(),
    }),
}));

let selfLinked = false;
vi.mock('@/composables/useMembers', () => ({
    useMembers: () => ({
        getMembers: vi.fn(async () => [
            {userId: 1, role: 'owner', createdAt: '', slackLinked: selfLinked, user: {name: 'Ada', email: 'ada@example.com'}},
            {userId: 2, role: 'member', createdAt: '', slackLinked: false, user: {name: 'Grace', email: 'grace@example.com'}},
        ]),
        getInvitations: vi.fn(async () => []),
        leaveIntegration: vi.fn(),
    }),
}));

vi.mock('@/composables/useGithubApp', () => ({
    useGithubApp: () => ({linkInstallation: vi.fn(), unlinkInstallation: vi.fn(), updateWebhookEvents: vi.fn()}),
}));

const slackApp = {
    appId: 'app-s',
    type: 'slack',
    createdAt: '',
    workspace: {teamId: 'T1', teamName: 'Acme', disconnected: false},
    handles: [],
    linkedMemberCount: 0,
    memberCount: 2,
};

const listApps = vi.fn(async (): Promise<unknown[]> => []);
const slackConnectUrl = vi.fn((integrationId: string, redirectUrl: string) => `https://api.test/${integrationId}/slack/connect?r=${redirectUrl}`);
vi.mock('@/composables/useIntegrationApps', () => ({
    useIntegrationApps: () => ({listApps, installApp: vi.fn(), uninstallApp: vi.fn(), slackConnectUrl}),
}));

const refreshSession = vi.fn(async () => true);
vi.mock('@/composables/useAuth', () => ({
    useAuth: () => ({getUserAttributes: vi.fn(async () => ({userId: 1})), refreshSession, fetchWithAuth: vi.fn()}),
}));

const PROMPT = 'Connect your Slack account to get pinged on your failures';
const DISMISSED_KEY = 'gitgazer:slack-prompt-dismissed:int-1';

const DEFAULT_STUBS: Record<string, Component | boolean> = {AppsTab: true, IntegrationMembers: {template: '<div data-testid="members-tab" />'}};

async function mountAt(path: string, stubs: Record<string, Component | boolean> = DEFAULT_STUBS) {
    const memoryRouter = createRouter({
        history: createMemoryHistory(),
        routes: [
            {path: '/integrations', name: 'integrations', component: {template: '<div />'}},
            {path: '/integrations/:integrationId/:tab(apps|members|settings)', name: 'integration', component: IntegrationPage},
        ],
    });
    await memoryRouter.push(path);
    const wrapper = mount({template: '<RouterView />'}, {global: {plugins: [memoryRouter], stubs}});
    await flushPromises();
    return {wrapper, router: memoryRouter};
}

describe('IntegrationPage', () => {
    beforeEach(() => {
        role = 'owner';
        selfLinked = false;
        listApps.mockReset();
        listApps.mockResolvedValue([]);
        localStorage.clear();
    });

    it('renders Apps, Members and Settings tabs and selects the tab from the route', async () => {
        const {wrapper} = await mountAt('/integrations/int-1/members');

        const tabs = wrapper.findAll('[role="tab"]');
        expect(tabs.map((t) => t.text())).toEqual(['Apps', 'Members', 'Settings']);
        expect(tabs.map((t) => t.attributes('aria-selected'))).toEqual(['false', 'true', 'false']);
        expect(wrapper.find('[data-testid="members-tab"]').exists()).toBe(true);
        expect(wrapper.find('h1').text()).toBe('Platform');
        expect(wrapper.text()).not.toContain('Owner Ada');

        // Radix tabs select on mousedown (and on focus), not on click
        await tabs[2].trigger('mousedown');
        await flushPromises();
        expect(wrapper.find('[role="tab"][aria-selected="true"]').text()).toBe('Settings');
    });

    it('reloads the apps when navigating to another integration', async () => {
        const {router: memoryRouter} = await mountAt('/integrations/int-1/apps', {
            GithubAppPanel: true,
            WebhookAppPanel: true,
            ConnectSlackPrompt: true,
        });
        expect(listApps.mock.calls).toEqual([['int-1']]);

        await memoryRouter.push('/integrations/int-2/apps');
        await flushPromises();

        expect(listApps.mock.calls).toEqual([['int-1'], ['int-2']]);
    });

    it('redirects /integrations/:id/users to the members tab', async () => {
        await router.push('/integrations/int-1/users');
        expect(router.currentRoute.value.fullPath).toBe('/integrations/int-1/members');

        await router.push('/integrations/int-1');
        expect(router.currentRoute.value.fullPath).toBe('/integrations/int-1/apps');
    });

    it('hides Rename, Leave and Delete in Settings for a viewer', async () => {
        role = 'viewer';
        const {wrapper} = await mountAt('/integrations/int-1/settings');
        const names = wrapper.findAll('button').map((b) => b.text());

        expect(names).not.toContain('Rename');
        expect(names).not.toContain('Delete');
        // A viewer is not the owner, so today's rule still lets them leave.
        expect(names).toContain('Leave');
    });

    it('shows Rename and Delete but not Leave to the owner', async () => {
        const {wrapper} = await mountAt('/integrations/int-1/settings');
        const names = wrapper.findAll('button').map((b) => b.text());

        expect(names).toContain('Rename');
        expect(names).toContain('Delete');
        expect(names).not.toContain('Leave');
    });

    describe('Connect Slack prompt', () => {
        it('prompts unlinked members to connect Slack when the integration has a Slack app', async () => {
            listApps.mockResolvedValue([slackApp]);
            const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
            const {wrapper} = await mountAt('/integrations/int-1/settings');

            expect(wrapper.text()).toContain(PROMPT);
            await wrapper
                .findAll('button')
                .find((b) => b.text() === 'Connect Slack')!
                .trigger('click');
            await flushPromises();

            const redirectUrl = `${window.location.origin}/integrations/int-1/members`;
            expect(refreshSession).toHaveBeenCalled();
            expect(slackConnectUrl).toHaveBeenCalledWith('int-1', redirectUrl);
            expect(assign).toHaveBeenCalledWith(`https://api.test/int-1/slack/connect?r=${redirectUrl}`);
            assign.mockRestore();
        });

        it('no prompt when linked or without a Slack app', async () => {
            const withoutApp = await mountAt('/integrations/int-1/settings');
            expect(withoutApp.wrapper.text()).not.toContain(PROMPT);

            listApps.mockResolvedValue([{...slackApp, workspace: {...slackApp.workspace, disconnected: true}}]);
            const disconnected = await mountAt('/integrations/int-1/settings');
            expect(disconnected.wrapper.text()).not.toContain(PROMPT);

            listApps.mockResolvedValue([slackApp]);
            selfLinked = true;
            const linked = await mountAt('/integrations/int-1/settings');
            expect(linked.wrapper.text()).not.toContain(PROMPT);
        });

        it('dismissing hides the prompt in this browser', async () => {
            listApps.mockResolvedValue([slackApp]);
            const first = await mountAt('/integrations/int-1/settings');
            await first.wrapper
                .findAll('button')
                .find((b) => b.text() === 'Dismiss')!
                .trigger('click');
            expect(first.wrapper.text()).not.toContain(PROMPT);
            expect(localStorage.getItem(DISMISSED_KEY)).toBe('1');

            const again = await mountAt('/integrations/int-1/settings');
            expect(again.wrapper.text()).not.toContain(PROMPT);
        });

        it('still prompts when browser storage throws', async () => {
            listApps.mockResolvedValue([slackApp]);
            const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
                throw new Error('denied');
            });
            const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
                throw new Error('denied');
            });
            const {wrapper} = await mountAt('/integrations/int-1/settings');
            expect(wrapper.text()).toContain(PROMPT);

            await wrapper
                .findAll('button')
                .find((b) => b.text() === 'Dismiss')!
                .trigger('click');
            expect(wrapper.text()).not.toContain(PROMPT);
            getItem.mockRestore();
            setItem.mockRestore();
        });
    });
});
