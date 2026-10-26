import WebhookAppPanel from '@/components/apps/WebhookAppPanel.vue';
import type {IntegrationApp, NotificationHandle} from '@common/types';
import {flushPromises, mount} from '@vue/test-utils';
import {describe, expect, it, vi} from 'vitest';

const createHandle = vi.fn();
const updateHandle = vi.fn();
const deleteHandle = vi.fn();

vi.mock('@/composables/useIntegrationApps', () => ({
    useIntegrationApps: () => ({createHandle, updateHandle, deleteHandle}),
}));

type WebhookApp = Extract<IntegrationApp, {type: 'webhook'}>;

function makeApp(handles: NotificationHandle[]): WebhookApp {
    return {appId: 'app-w', type: 'webhook', createdAt: '', handles};
}

function handle(overrides: Partial<NotificationHandle>): NotificationHandle {
    return {
        handleId: 'h-1',
        appId: 'app-w',
        name: '#ci-alerts',
        url: 'https://hooks.slack.com/services/T/B/X',
        channelName: null,
        ruleCount: 0,
        ...overrides,
    };
}

function mountPanel(props: {app: WebhookApp; canManage: boolean}) {
    return mount(WebhookAppPanel, {
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

describe('WebhookAppPanel', () => {
    it('viewer sees handle names but no URL and no Add handle button', () => {
        const wrapper = mountPanel({
            app: makeApp([handle({name: '#ci-alerts', url: null}), handle({handleId: 'h-2', name: '#deploys', url: null})]),
            canManage: false,
        });

        expect(wrapper.text()).toContain('#ci-alerts');
        expect(wrapper.text()).toContain('#deploys');
        expect(wrapper.text()).not.toContain('hooks.slack.com');
        expect(buttonByText(wrapper, 'Add handle')).toBeUndefined();
        expect(wrapper.find('.dropdown-menu').exists()).toBe(false);
    });

    it('admin adding a non-Slack URL sees a validation error and no request is sent', async () => {
        const wrapper = mountPanel({app: makeApp([]), canManage: true});

        await buttonByText(wrapper, 'Add handle')!.trigger('click');
        await wrapper.find('#handle-name').setValue('#ci-alerts');
        await wrapper.find('#handle-url').setValue('https://example.com/hook');
        await wrapper.find('form').trigger('submit');
        await flushPromises();

        const urlInput = wrapper.find('#handle-url');
        expect(urlInput.attributes('aria-invalid')).toBe('true');
        const errorId = urlInput.attributes('aria-describedby');
        expect(wrapper.find(`#${errorId}`).text()).toContain('https://hooks.slack.com/');
        expect(createHandle).not.toHaveBeenCalled();
    });

    it('deleting a handle used by rules shows the warning with the rule count', async () => {
        const wrapper = mountPanel({app: makeApp([handle({name: '#ci-alerts', ruleCount: 3})]), canManage: true});

        const deleteItem = wrapper.findAll('.dropdown-item').find((i) => i.text().includes('Delete'));
        await deleteItem!.trigger('click');

        const dialog = wrapper.find('[role="dialog"]');
        expect(dialog.exists()).toBe(true);
        expect(dialog.text()).toContain('#ci-alerts');
        expect(dialog.text()).toContain('3 rules');
        expect(deleteHandle).not.toHaveBeenCalled();
    });
});
