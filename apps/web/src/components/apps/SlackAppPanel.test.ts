import SlackAppPanel from '@/components/apps/SlackAppPanel.vue';
import type {IntegrationApp, NotificationHandle} from '@common/types';
import {flushPromises, mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const listSlackChannels = vi.fn();
const createSlackHandle = vi.fn();
const updateHandle = vi.fn();
const deleteHandle = vi.fn();
const listMoveCandidates = vi.fn();
const moveWebhookHandles = vi.fn();

vi.mock('@/composables/useIntegrationApps', () => ({
    useIntegrationApps: () => ({listSlackChannels, createSlackHandle, updateHandle, deleteHandle, listMoveCandidates, moveWebhookHandles}),
}));

type SlackApp = Extract<IntegrationApp, {type: 'slack'}>;

function makeApp(overrides: Partial<SlackApp> = {}): SlackApp {
    return {
        appId: 'app-s',
        type: 'slack',
        createdAt: '',
        workspace: {teamId: 'T1', teamName: 'Acme', disconnected: false},
        handles: [],
        linkedMemberCount: 4,
        memberCount: 9,
        ...overrides,
    };
}

function handle(overrides: Partial<NotificationHandle>): NotificationHandle {
    return {handleId: 'h-1', appId: 'app-s', name: '#ci-alerts', url: null, channelName: 'ci-alerts', ruleCount: 0, ...overrides};
}

function mountPanel(props: {app: SlackApp; canManage: boolean}) {
    return mount(SlackAppPanel, {
        props: {integrationId: 'int-1', ...props},
        global: {
            stubs: {
                Teleport: true,
                // Radix menus portal their content and open on pointer events; render items inline instead.
                DropdownMenu: {template: '<div class="dropdown-menu"><slot name="trigger" /><slot /></div>'},
                DropdownMenuItem: {template: '<div class="dropdown-item" @click="$emit(\'select\')"><slot /></div>', emits: ['select']},
            },
        },
    });
}

function buttonByText(wrapper: ReturnType<typeof mountPanel>, text: string) {
    return wrapper.findAll('button').find((b) => b.text().trim() === text);
}

describe('SlackAppPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        listMoveCandidates.mockResolvedValue([]);
    });

    it('shows workspace and handles', () => {
        const wrapper = mountPanel({
            app: makeApp({handles: [handle({name: 'CI alerts', channelName: 'ci', ruleCount: 3})]}),
            canManage: true,
        });

        expect(wrapper.text()).toContain('Acme');
        expect(wrapper.text()).toContain('CI alerts');
        expect(wrapper.text()).toContain('#ci');
        expect(wrapper.text()).toContain('3 rules');
        expect(wrapper.text()).toContain('4 of 9 members linked');
        expect(wrapper.text()).not.toContain('Disconnected');
    });

    it('shows Disconnected with a reinstall action', async () => {
        const wrapper = mountPanel({app: makeApp({workspace: {teamId: 'T1', teamName: 'Acme', disconnected: true}}), canManage: true});

        expect(wrapper.text()).toContain('Disconnected — reinstall');
        expect(buttonByText(wrapper, 'Add channel')!.attributes('disabled')).toBeDefined();

        await buttonByText(wrapper, 'Reinstall')!.trigger('click');
        expect(wrapper.emitted('reinstall')).toHaveLength(1);
    });

    it('admins add a handle from the channel picker', async () => {
        listSlackChannels.mockResolvedValue([
            {id: 'C1', name: 'general', isPrivate: false},
            {id: 'C2', name: 'deploys', isPrivate: true},
        ]);
        createSlackHandle.mockResolvedValue(handle({handleId: 'h-2', name: '#deploys', channelName: 'deploys'}));
        const wrapper = mountPanel({app: makeApp(), canManage: true});

        await buttonByText(wrapper, 'Add channel')!.trigger('click');
        await flushPromises();
        await wrapper.find('input[type="radio"][value="C2"]').setValue(true);
        await wrapper.find('form').trigger('submit');
        await flushPromises();

        expect(listSlackChannels).toHaveBeenCalledWith('int-1', 'app-s');
        expect(createSlackHandle).toHaveBeenCalledWith('int-1', 'app-s', {channelId: 'C2'});
        expect(wrapper.emitted('changed')).toHaveLength(1);
        expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    });

    it('admins rename a handle', async () => {
        updateHandle.mockResolvedValue(handle({name: 'Deploys'}));
        const wrapper = mountPanel({app: makeApp({handles: [handle({})]}), canManage: true});

        await wrapper
            .findAll('.dropdown-item')
            .find((i) => i.text().includes('Rename'))!
            .trigger('click');
        expect(wrapper.find('#handle-url').exists()).toBe(false);
        await wrapper.find('#handle-name').setValue('Deploys');
        await wrapper.find('form').trigger('submit');
        await flushPromises();

        expect(updateHandle).toHaveBeenCalledWith('int-1', 'h-1', {name: 'Deploys'});
        expect(wrapper.emitted('changed')).toHaveLength(1);
    });

    it('members see no manage actions', () => {
        const wrapper = mountPanel({
            app: makeApp({workspace: {teamId: 'T1', teamName: 'Acme', disconnected: true}, handles: [handle({name: 'CI alerts'})]}),
            canManage: false,
        });

        expect(wrapper.text()).toContain('CI alerts');
        expect(wrapper.text()).toContain('Disconnected');
        expect(buttonByText(wrapper, 'Add channel')).toBeUndefined();
        expect(buttonByText(wrapper, 'Reinstall')).toBeUndefined();
        expect(buttonByText(wrapper, 'Remove Slack app')).toBeUndefined();
        expect(wrapper.find('.dropdown-menu').exists()).toBe(false);
    });

    it('offers the move only while candidates exist', async () => {
        listMoveCandidates.mockResolvedValueOnce([{handleId: 'w-1', name: 'Deploys', ruleCount: 2}]).mockResolvedValueOnce([]);
        listSlackChannels.mockResolvedValue([{id: 'C1', name: 'deploys', isPrivate: false}]);
        moveWebhookHandles.mockResolvedValue({moved: ['w-1'], failed: [], webhookAppEmpty: true});
        const wrapper = mountPanel({app: makeApp(), canManage: true});
        await flushPromises();

        expect(listMoveCandidates).toHaveBeenCalledWith('int-1');
        expect(wrapper.text()).toContain('1 Webhook handle posts to this workspace');

        await buttonByText(wrapper, 'Move to channels')!.trigger('click');
        await flushPromises();
        await wrapper.find('select#move-w-1').setValue('C1');
        await wrapper.find('form').trigger('submit');
        await flushPromises();

        expect(wrapper.emitted('changed')).toHaveLength(1);
        expect(buttonByText(wrapper, 'Move to channels')).toBeUndefined();

        await buttonByText(wrapper, 'Remove Webhook app')!.trigger('click');
        expect(wrapper.emitted('remove-webhook')).toHaveLength(1);
    });

    it('does not look for move candidates without admin rights or while disconnected', async () => {
        mountPanel({app: makeApp(), canManage: false});
        mountPanel({app: makeApp({workspace: {teamId: 'T1', teamName: 'Acme', disconnected: true}}), canManage: true});
        await flushPromises();

        expect(listMoveCandidates).not.toHaveBeenCalled();
    });
});
