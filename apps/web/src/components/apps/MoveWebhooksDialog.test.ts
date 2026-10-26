import MoveWebhooksDialog from '@/components/apps/MoveWebhooksDialog.vue';
import {flushPromises, mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const listSlackChannels = vi.fn();
const moveWebhookHandles = vi.fn();

vi.mock('@/composables/useIntegrationApps', () => ({
    useIntegrationApps: () => ({listSlackChannels, moveWebhookHandles}),
}));

const candidates = [
    {handleId: 'w-1', name: 'Deploys', ruleCount: 2},
    {handleId: 'w-2', name: 'Nightly', ruleCount: 1},
];

async function mountDialog() {
    const wrapper = mount(MoveWebhooksDialog, {
        props: {open: true, integrationId: 'int-1', appId: 'app-s', candidates},
        global: {stubs: {Teleport: true}},
    });
    await flushPromises();
    return wrapper;
}

function moveButton(wrapper: Awaited<ReturnType<typeof mountDialog>>) {
    return wrapper.findAll('button').find((b) => b.text() === 'Move handles')!;
}

async function moveFirstToDeploys(wrapper: Awaited<ReturnType<typeof mountDialog>>) {
    await wrapper.find('select#move-w-1').setValue('C2');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
}

describe('MoveWebhooksDialog', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        listSlackChannels.mockResolvedValue([
            {id: 'C1', name: 'general', isPrivate: false},
            {id: 'C2', name: 'deploys', isPrivate: true},
        ]);
    });

    it('requires a channel per selected handle and allows skipping', async () => {
        moveWebhookHandles.mockResolvedValue({moved: ['w-1'], failed: [], webhookAppEmpty: false});
        const wrapper = await mountDialog();

        expect(listSlackChannels).toHaveBeenCalledWith('int-1', 'app-s');
        expect(wrapper.find('label[for="move-w-1"]').text()).toContain('Deploys');
        expect(wrapper.text()).toContain('2 rules');
        expect(wrapper.find<HTMLSelectElement>('select#move-w-2').element.value).toBe('');
        expect(moveButton(wrapper).attributes('disabled')).toBeDefined();

        await moveFirstToDeploys(wrapper);

        expect(moveWebhookHandles).toHaveBeenCalledWith('int-1', [{webhookHandleId: 'w-1', channelId: 'C2'}]);
    });

    it('shows moved and failed results', async () => {
        moveWebhookHandles.mockResolvedValue({moved: ['w-1'], failed: ['w-2'], webhookAppEmpty: false});
        const wrapper = await mountDialog();

        await wrapper.find('select#move-w-2').setValue('C1');
        await moveFirstToDeploys(wrapper);

        expect(wrapper.find('[role="status"]').text()).toContain('Moved 1 of 2 handles');
        expect(wrapper.text()).toContain('Deploys → #deploys');
        expect(wrapper.find('[role="alert"]').text()).toContain('Nightly');
        expect(wrapper.emitted('moved')).toHaveLength(1);
        expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('Remove Webhook app');
    });

    it('keeps the choices and shows the error when the move fails', async () => {
        moveWebhookHandles.mockRejectedValue(new Error('The Slack app is not installed'));
        const wrapper = await mountDialog();

        await moveFirstToDeploys(wrapper);

        expect(wrapper.find('[role="alert"]').text()).toContain('The Slack app is not installed');
        expect(wrapper.find('select#move-w-1').exists()).toBe(true);
        expect(wrapper.emitted('moved')).toBeUndefined();
    });

    it('ends with the Slack cleanup checklist and app management link', async () => {
        moveWebhookHandles.mockResolvedValue({moved: ['w-1'], failed: [], webhookAppEmpty: false});
        const wrapper = await mountDialog();

        await moveFirstToDeploys(wrapper);

        expect(wrapper.text()).toContain('Remove these webhooks in Slack: Deploys');
        const link = wrapper.find('a[href="https://slack.com/apps/manage"]');
        expect(link.exists()).toBe(true);
        expect(link.attributes('target')).toBe('_blank');
        expect(link.attributes('rel')).toContain('noopener');
        expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('Remove Webhook app');
    });

    it('offers removing an empty Webhook app', async () => {
        moveWebhookHandles.mockResolvedValue({moved: ['w-1', 'w-2'], failed: [], webhookAppEmpty: true});
        const wrapper = await mountDialog();

        await wrapper.find('select#move-w-2').setValue('C1');
        await moveFirstToDeploys(wrapper);
        await wrapper
            .findAll('button')
            .find((b) => b.text() === 'Remove Webhook app')!
            .trigger('click');

        expect(wrapper.emitted('remove-webhook-app')).toHaveLength(1);
        expect(wrapper.emitted('update:open')).toEqual([[false]]);
    });
});
