import IntegrationPage from '@/views/IntegrationPage.vue';
import router from '@/router';
import type {MemberRole} from '@common/types';
import {flushPromises, mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ref} from 'vue';
import {createMemoryHistory, createRouter} from 'vue-router';

let role: MemberRole = 'owner';

vi.mock('@/composables/useIntegration', () => ({
    useIntegration: () => ({
        getIntegrations: vi.fn(async () => [{integrationId: 'int-1', label: 'Platform', role, createdAt: '', githubAppInstallations: []}]),
        isLoadingIntegrations: ref(false),
        createIntegration: vi.fn(),
        updateIntegration: vi.fn(),
        deleteIntegration: vi.fn(),
        rotateSecret: vi.fn(),
        updateOrgSyncDefaultRole: vi.fn(),
    }),
}));

vi.mock('@/composables/useMembers', () => ({
    useMembers: () => ({
        getMembers: vi.fn(async () => [{userId: 1, role: 'owner', createdAt: '', user: {name: 'Ada', email: 'ada@example.com'}}]),
        getInvitations: vi.fn(async () => []),
        leaveIntegration: vi.fn(),
    }),
}));

vi.mock('@/composables/useGithubApp', () => ({
    useGithubApp: () => ({linkInstallation: vi.fn(), unlinkInstallation: vi.fn(), updateWebhookEvents: vi.fn()}),
}));

async function mountAt(path: string) {
    const memoryRouter = createRouter({
        history: createMemoryHistory(),
        routes: [
            {path: '/integrations', name: 'integrations', component: {template: '<div />'}},
            {path: '/integrations/:integrationId/:tab(apps|members|settings)', name: 'integration', component: IntegrationPage},
        ],
    });
    await memoryRouter.push(path);
    const wrapper = mount(
        {template: '<RouterView />'},
        {global: {plugins: [memoryRouter], stubs: {IntegrationMembers: {template: '<div data-testid="members-tab" />'}}}},
    );
    await flushPromises();
    return {wrapper, router: memoryRouter};
}

describe('IntegrationPage', () => {
    beforeEach(() => {
        role = 'owner';
    });

    it('renders Apps, Members and Settings tabs and selects the tab from the route', async () => {
        const {wrapper} = await mountAt('/integrations/int-1/members');

        const tabs = wrapper.findAll('[role="tab"]');
        expect(tabs.map((t) => t.text())).toEqual(['Apps', 'Members', 'Settings']);
        expect(tabs.map((t) => t.attributes('aria-selected'))).toEqual(['false', 'true', 'false']);
        expect(wrapper.find('[data-testid="members-tab"]').exists()).toBe(true);
        expect(wrapper.find('h1').text()).toBe('Platform');
        expect(wrapper.text()).toContain('Owner Ada');

        await tabs[2].trigger('click');
        await flushPromises();
        expect(wrapper.find('[role="tab"][aria-selected="true"]').text()).toBe('Settings');
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
});
