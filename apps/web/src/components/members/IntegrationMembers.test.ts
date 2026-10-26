import IntegrationMembers from '@/components/members/IntegrationMembers.vue';
import {flushPromises, mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createMemoryHistory, createRouter} from 'vue-router';

const member = (userId: number, name: string, slackLinked: boolean) => ({
    userId,
    role: 'member',
    createdAt: '',
    slackLinked,
    user: {name, email: null, githubLogin: null, picture: null, lastActiveAt: null},
});

const slackApp = {
    appId: 'app-s',
    type: 'slack',
    createdAt: '',
    workspace: {teamId: 'T1', teamName: 'Acme', disconnected: false},
    handles: [],
    linkedMemberCount: 0,
    memberCount: 2,
};

const getMembers = vi.fn();
const disconnectSlack = vi.fn();
const listApps = vi.fn();
const connectSlack = vi.fn();

vi.mock('@/composables/useMembers', () => ({
    useMembers: () => ({getMembers, getInvitations: vi.fn(async () => []), disconnectSlack}),
}));

vi.mock('@/composables/useIntegrationApps', () => ({
    useIntegrationApps: () => ({listApps, connectSlack}),
}));

vi.mock('@/composables/useAuth', () => ({
    useAuth: () => ({getUserAttributes: vi.fn(async () => ({userId: 1}))}),
}));

async function mountMembers(path = '/integrations/int-1/members') {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [{path: '/integrations/:integrationId/:tab', name: 'integration', component: {template: '<div />'}}],
    });
    await router.push(path);
    const wrapper = mount(IntegrationMembers, {
        props: {integrationId: 'int-1', role: 'member'},
        global: {plugins: [router], stubs: {Teleport: true}},
    });
    await flushPromises();
    return {wrapper, router};
}

function buttonNamed(wrapper: Awaited<ReturnType<typeof mountMembers>>['wrapper'], text: string) {
    return wrapper.findAll('button').find((b) => b.text() === text);
}

describe('IntegrationMembers Slack', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getMembers.mockResolvedValue([member(1, 'Ada', false), member(2, 'Grace', true)]);
        listApps.mockResolvedValue([slackApp]);
    });

    it("offers Connect Slack only on the signed-in user's row", async () => {
        const {wrapper} = await mountMembers();

        // Grace is linked, so her row would offer Disconnect if it were treated as the signed-in user's
        const names = wrapper.findAll('button').map((b) => b.text());
        expect(names.filter((n) => n === 'Connect Slack')).toHaveLength(1);
        expect(names).not.toContain('Disconnect Slack');
    });

    it('offers no Slack actions without a Slack app', async () => {
        listApps.mockResolvedValue([]);
        const {wrapper} = await mountMembers();

        expect(buttonNamed(wrapper, 'Connect Slack')).toBeUndefined();
    });

    it('Connect Slack starts the Slack connect flow', async () => {
        const {wrapper} = await mountMembers();

        await buttonNamed(wrapper, 'Connect Slack')!.trigger('click');
        await flushPromises();

        expect(connectSlack).toHaveBeenCalledWith('int-1');
    });

    it('shows why Connect Slack failed', async () => {
        connectSlack.mockRejectedValue(new Error('Your session expired. Sign in again to connect Slack.'));
        const {wrapper} = await mountMembers();

        await buttonNamed(wrapper, 'Connect Slack')!.trigger('click');
        await flushPromises();

        expect(wrapper.find('[role="alert"]').text()).toContain('Sign in again');
    });

    it('Disconnect Slack removes the link of the signed-in user', async () => {
        getMembers.mockResolvedValue([member(1, 'Ada', true)]);
        disconnectSlack.mockResolvedValue(undefined);
        const {wrapper} = await mountMembers();

        await buttonNamed(wrapper, 'Disconnect Slack')!.trigger('click');
        await flushPromises();

        expect(disconnectSlack).toHaveBeenCalledWith('int-1');
        expect(buttonNamed(wrapper, 'Connect Slack')).toBeDefined();
    });

    it('shows the connect outcome from the query and removes it', async () => {
        const connected = await mountMembers('/integrations/int-1/members?slack=connected&keep=1');
        expect(connected.wrapper.find('[role="status"]').text()).toContain('Slack account connected');
        expect(connected.router.currentRoute.value.query).toEqual({keep: '1'});

        const mismatch = await mountMembers('/integrations/int-1/members?slack_error=workspace_mismatch');
        expect(mismatch.wrapper.find('[role="alert"]').text()).toContain('different Slack workspace');
        expect(mismatch.router.currentRoute.value.query).toEqual({});
    });
});
