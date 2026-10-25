import AppsTab from '@/components/apps/AppsTab.vue';
import type {IntegrationApp, IntegrationWithRole, MemberRole} from '@common/types';
import {flushPromises, mount} from '@vue/test-utils';
import {describe, expect, it, vi} from 'vitest';

const githubOnly: IntegrationApp[] = [{appId: 'app-g', type: 'github', createdAt: '', settings: {secret: null, orgSyncDefaultRole: 'viewer'}}];

const listApps = vi.fn();
const installApp = vi.fn();

vi.mock('@/composables/useIntegrationApps', () => ({
    useIntegrationApps: () => ({listApps, installApp, uninstallApp: vi.fn()}),
}));

async function mountTab(role: MemberRole) {
    listApps.mockResolvedValue(githubOnly);
    const integration = {
        integrationId: 'int-1',
        label: 'Platform',
        role,
        createdAt: '',
        githubAppInstallations: [],
    } as unknown as IntegrationWithRole;
    const wrapper = mount(AppsTab, {
        props: {integration},
        global: {stubs: {Teleport: true, GithubAppPanel: true, WebhookAppPanel: true}},
    });
    await flushPromises();
    return wrapper;
}

function catalogItem(wrapper: Awaited<ReturnType<typeof mountTab>>, name: string) {
    return wrapper.findAll('[aria-labelledby="apps-available-heading"] li').find((li) => li.find('h3').text() === name);
}

describe('AppsTab', () => {
    it('shows Slack as the only app coming later and not installable', async () => {
        const wrapper = await mountTab('owner');

        const slack = catalogItem(wrapper, 'Slack');
        expect(slack).toBeDefined();
        expect(slack!.text()).toContain('Coming later');
        expect(slack!.findAll('button')).toHaveLength(0);
        expect(wrapper.findAll('li').filter((li) => li.text().includes('Coming later'))).toHaveLength(1);
    });

    it('shows Install for the webhook app when it is not installed (admin only)', async () => {
        const admin = await mountTab('admin');
        const webhook = catalogItem(admin, 'Webhook');
        expect(webhook).toBeDefined();
        expect(webhook!.findAll('button').map((b) => b.text())).toContain('Install');
        expect(catalogItem(admin, 'GitHub')).toBeUndefined();

        const viewer = await mountTab('viewer');
        expect(catalogItem(viewer, 'Webhook')).toBeDefined();
        expect(viewer.findAll('button').map((b) => b.text())).not.toContain('Install');
    });
});
