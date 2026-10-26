import AppsTab from '@/components/apps/AppsTab.vue';
import type {IntegrationApp, IntegrationWithRole, MemberRole} from '@common/types';
import {flushPromises, mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createMemoryHistory, createRouter} from 'vue-router';

const githubOnly: IntegrationApp[] = [{appId: 'app-g', type: 'github', createdAt: '', settings: {secret: null, orgSyncDefaultRole: 'viewer'}}];

const listApps = vi.fn();
const installApp = vi.fn();
const slackInstallUrl = vi.fn((integrationId: string, redirectUrl: string) => `https://api.test/${integrationId}/slack/install?r=${redirectUrl}`);
const refreshSession = vi.fn(async () => true);

vi.mock('@/composables/useIntegrationApps', () => ({
    useIntegrationApps: () => ({listApps, installApp, uninstallApp: vi.fn(), slackInstallUrl}),
}));

vi.mock('@/composables/useAuth', () => ({
    useAuth: () => ({refreshSession}),
}));

async function mountTab(role: MemberRole, path = '/integrations/int-1/apps', apps: IntegrationApp[] = githubOnly) {
    listApps.mockResolvedValue(apps);
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [{path: '/integrations/:integrationId/:tab', name: 'integration', component: {template: '<div />'}}],
    });
    await router.push(path);
    const integration = {
        integrationId: 'int-1',
        label: 'Platform',
        role,
        createdAt: '',
        githubAppInstallations: [],
    } as unknown as IntegrationWithRole;
    const wrapper = mount(AppsTab, {
        props: {integration},
        global: {plugins: [router], stubs: {Teleport: true, GithubAppPanel: true, WebhookAppPanel: true, SlackAppPanel: true}},
    });
    await flushPromises();
    return {wrapper, router};
}

function catalogItem(wrapper: Awaited<ReturnType<typeof mountTab>>['wrapper'], name: string) {
    return wrapper.findAll('[aria-labelledby="apps-available-heading"] li').find((li) => li.find('h3').text() === name);
}

describe('AppsTab', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('Slack is installable, not coming later', async () => {
        const {wrapper} = await mountTab('admin');

        const slack = catalogItem(wrapper, 'Slack');
        expect(slack).toBeDefined();
        expect(slack!.findAll('button').map((b) => b.text())).toContain('Install');
        expect(wrapper.text()).not.toContain('Coming later');
    });

    it('shows Install for the webhook app when it is not installed (admin only)', async () => {
        const {wrapper: admin} = await mountTab('admin');
        const webhook = catalogItem(admin, 'Webhook');
        expect(webhook).toBeDefined();
        expect(webhook!.findAll('button').map((b) => b.text())).toContain('Install');
        expect(catalogItem(admin, 'GitHub')).toBeUndefined();

        const {wrapper: viewer} = await mountTab('viewer');
        expect(catalogItem(viewer, 'Webhook')).toBeDefined();
        expect(viewer.findAll('button').map((b) => b.text())).not.toContain('Install');
    });

    it('install navigates to the install URL', async () => {
        const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
        const {wrapper} = await mountTab('admin');

        await wrapper.find('button[aria-label="Install Slack"]').trigger('click');
        await flushPromises();

        const redirectUrl = window.location.origin + window.location.pathname;
        expect(refreshSession).toHaveBeenCalled();
        expect(slackInstallUrl).toHaveBeenCalledWith('int-1', redirectUrl);
        expect(assign).toHaveBeenCalledWith(`https://api.test/int-1/slack/install?r=${redirectUrl}`);
        expect(installApp).not.toHaveBeenCalled();
        expect(wrapper.find('button[aria-label="Install Slack"]').attributes('disabled')).toBeUndefined();
        assign.mockRestore();
    });

    it('install stops with an error when the session cannot be refreshed', async () => {
        refreshSession.mockResolvedValueOnce(false);
        const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
        const {wrapper} = await mountTab('admin');

        await wrapper.find('button[aria-label="Install Slack"]').trigger('click');
        await flushPromises();

        expect(assign).not.toHaveBeenCalled();
        expect(wrapper.find('[role="alert"]').text()).toContain('Your session expired');
        assign.mockRestore();
    });

    it('shows installed/error feedback from the query', async () => {
        const installed = await mountTab('admin', '/integrations/int-1/apps?slack=installed&keep=1');
        expect(installed.wrapper.find('[role="status"]').text()).toContain('Slack app installed');
        expect(installed.router.currentRoute.value.query).toEqual({keep: '1'});

        const enterprise = await mountTab('admin', '/integrations/int-1/apps?slack_error=enterprise');
        expect(enterprise.wrapper.find('[role="alert"]').text()).toContain("Org-wide installs aren't supported");
        expect(enterprise.router.currentRoute.value.query).toEqual({});

        const mismatch = await mountTab('admin', '/integrations/int-1/apps?slack_error=workspace_mismatch');
        expect(mismatch.wrapper.find('[role="alert"]').text()).toContain('already uses another Slack workspace');

        const failed = await mountTab('admin', '/integrations/int-1/apps?slack_error=failed');
        expect(failed.wrapper.find('[role="alert"]').text()).toContain('Installing the Slack app failed');

        const unknown = await mountTab('admin', '/integrations/int-1/apps?slack=other');
        expect(unknown.wrapper.find('[role="alert"]').exists()).toBe(false);
        expect(unknown.wrapper.find('[role="status"]').exists()).toBe(false);
    });

    it('the Slack panel can ask to remove the Webhook app', async () => {
        const apps = [
            ...githubOnly,
            {appId: 'app-w', type: 'webhook', createdAt: '', handles: []},
            {
                appId: 'app-s',
                type: 'slack',
                createdAt: '',
                workspace: {teamId: 'T1', teamName: 'Acme', disconnected: false},
                handles: [],
                linkedMemberCount: 0,
                memberCount: 1,
            },
        ] as IntegrationApp[];
        const {wrapper} = await mountTab('admin', '/integrations/int-1/apps?slack=installed', apps);

        wrapper.findComponent({name: 'SlackAppPanel'}).vm.$emit('remove-webhook');
        await flushPromises();

        expect(wrapper.find('[role="dialog"]').text()).toContain('Remove Webhook app?');
    });
});
