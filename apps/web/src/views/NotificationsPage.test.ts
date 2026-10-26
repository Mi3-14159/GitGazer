import NotificationsPage from '@/views/NotificationsPage.vue';
import type {NotificationRule} from '@common/types';
import {flushPromises, mount} from '@vue/test-utils';
import {describe, expect, it, vi} from 'vitest';
import {ref} from 'vue';

const rule = {
    id: 'r1',
    integrationId: 'int-1',
    label: 'Alerts',
    enabled: true,
    createdAt: '',
    updatedAt: '',
    ignore_dependabot: true,
    include_log_details: false,
    rule: {owner: 'o', repository_name: '', workflow_name: '', head_branch: '', topics: []},
    handleIds: ['h-1'],
} as unknown as NotificationRule;

const upsertNotification = vi.fn();
const getNotifications = vi.fn().mockResolvedValue([rule]);

vi.mock('@/composables/useNotification', () => ({
    useNotification: () => ({
        getNotifications,
        isLoadingNotifications: ref(false),
        upsertNotification,
        deleteNotification: vi.fn(),
    }),
}));

vi.mock('@/composables/useIntegration', () => ({
    useIntegration: () => ({getIntegrations: vi.fn().mockResolvedValue([{integrationId: 'int-1', label: 'I', role: 'owner'}])}),
}));

const listApps = vi.fn();

vi.mock('@/composables/useIntegrationApps', () => ({
    useIntegrationApps: () => ({listApps}),
}));

describe('NotificationsPage', () => {
    it("toggling the rule's enabled state keeps include_log_details", async () => {
        upsertNotification.mockResolvedValue(rule);
        listApps.mockResolvedValue([]);
        const wrapper = mount(NotificationsPage, {
            global: {
                stubs: {
                    PageHeader: true,
                    Dialog: true,
                    DeleteNotificationDialog: true,
                    NotificationCard: {
                        props: ['rule'],
                        emits: ['toggle'],
                        template: '<button class="toggle" @click="$emit(\'toggle\', rule)">toggle</button>',
                    },
                },
            },
        });
        await flushPromises();

        await wrapper.find('button.toggle').trigger('click');
        await flushPromises();

        expect(upsertNotification).toHaveBeenCalledWith(
            expect.objectContaining({enabled: false, include_log_details: false, ignore_dependabot: true}),
            'int-1',
            'r1',
        );
    });

    it('shows "No destination" for a rule without handles', async () => {
        listApps.mockResolvedValue([]);
        getNotifications.mockResolvedValueOnce([{...rule, handleIds: []}]);
        const wrapper = mount(NotificationsPage, {global: {stubs: {PageHeader: true, Dialog: true, DeleteNotificationDialog: true}}});
        await flushPromises();

        expect(wrapper.text()).toContain('No destination');
    });

    it('shows the handle names of a rule', async () => {
        listApps.mockResolvedValue([
            {appId: 'a', type: 'webhook', createdAt: '', handles: [{handleId: 'h-1', appId: 'a', name: 'Team Alpha', url: null, ruleCount: 1}]},
        ]);
        const wrapper = mount(NotificationsPage, {global: {stubs: {PageHeader: true, Dialog: true, DeleteNotificationDialog: true}}});
        await flushPromises();

        expect(wrapper.text()).toContain('Team Alpha');
    });

    it('notifications page names Slack handles', async () => {
        listApps.mockResolvedValue([
            {
                appId: 's',
                type: 'slack',
                createdAt: '',
                workspace: {teamId: 'T1', teamName: 'Acme', disconnected: false},
                handles: [{handleId: 'h-1', appId: 's', name: 'CI alerts', url: null, channelName: 'ci', ruleCount: 1}],
                linkedMemberCount: 0,
                memberCount: 1,
            },
        ]);
        const wrapper = mount(NotificationsPage, {global: {stubs: {PageHeader: true, Dialog: true, DeleteNotificationDialog: true}}});
        await flushPromises();

        expect(wrapper.text()).toContain('CI alerts');
    });

    it('shows the handle name on a rule saved for an integration without prior rules', async () => {
        getNotifications.mockResolvedValueOnce([]);
        listApps.mockResolvedValue([]);
        const saved = {...rule, handleIds: ['h-9']};
        upsertNotification.mockResolvedValue(saved);
        const wrapper = mount(NotificationsPage, {
            global: {
                stubs: {
                    PageHeader: true,
                    DeleteNotificationDialog: true,
                    Dialog: {template: '<div><slot :close="() => {}" /></div>'},
                    NotificationDetailsCard: {
                        props: ['onSave'],
                        data: () => ({draft: saved}),
                        template: '<button class="save" @click="onSave(draft)">save</button>',
                    },
                },
            },
        });
        await flushPromises();
        expect(wrapper.text()).not.toContain('Fresh');

        listApps.mockResolvedValue([
            {appId: 'a', type: 'webhook', createdAt: '', handles: [{handleId: 'h-9', appId: 'a', name: 'Fresh', url: null, ruleCount: 1}]},
        ]);
        await wrapper.find('button.save').trigger('click');
        await flushPromises();

        expect(wrapper.text()).toContain('Fresh');
    });
});
