import ChannelPickerDialog from '@/components/apps/ChannelPickerDialog.vue';
import {flushPromises, mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const listSlackChannels = vi.fn();

vi.mock('@/composables/useIntegrationApps', () => ({
    useIntegrationApps: () => ({listSlackChannels}),
}));

function mountDialog() {
    return mount(ChannelPickerDialog, {
        props: {open: true, integrationId: 'int-1', appId: 'app-s', saving: false, error: null},
        global: {stubs: {Teleport: true}},
    });
}

describe('ChannelPickerDialog', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('picker explains private channels need /invite', async () => {
        listSlackChannels.mockResolvedValue([
            {id: 'C1', name: 'general', isPrivate: false},
            {id: 'C2', name: 'deploys', isPrivate: true},
        ]);
        const wrapper = mountDialog();
        await flushPromises();

        expect(wrapper.text()).toContain('/invite @GitGazer');
        expect(wrapper.find('label[for="channel-C2"]').text()).toContain('private');
        expect(wrapper.find('label[for="channel-C1"]').text()).not.toContain('private');
    });

    it('loads channels on each open', async () => {
        listSlackChannels.mockResolvedValueOnce([{id: 'C1', name: 'general', isPrivate: false}]);
        listSlackChannels.mockResolvedValueOnce([
            {id: 'C1', name: 'general', isPrivate: false},
            {id: 'C2', name: 'deploys', isPrivate: true},
        ]);
        const wrapper = mountDialog();
        await flushPromises();
        expect(wrapper.find('input[value="C2"]').exists()).toBe(false);

        await wrapper.setProps({open: false});
        await wrapper.setProps({open: true});
        await flushPromises();

        expect(listSlackChannels).toHaveBeenCalledTimes(2);
        expect(wrapper.find('input[value="C2"]').exists()).toBe(true);
    });

    it('shows a load error with a retry', async () => {
        listSlackChannels.mockRejectedValueOnce(new Error('Slack workspace not found'));
        listSlackChannels.mockResolvedValueOnce([{id: 'C1', name: 'general', isPrivate: false}]);
        const wrapper = mountDialog();
        await flushPromises();

        expect(wrapper.find('[role="alert"]').text()).toContain('Slack workspace not found');
        await wrapper
            .findAll('button')
            .find((b) => b.text().trim() === 'Retry')!
            .trigger('click');
        await flushPromises();

        expect(wrapper.find('input[value="C1"]').exists()).toBe(true);
    });
});
