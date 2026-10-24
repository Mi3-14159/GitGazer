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
    channels: [{type: 'slack', webhook_url: 'https://hooks.slack.com/x'}],
} as unknown as NotificationRule;

const upsertNotification = vi.fn();

vi.mock('@/composables/useNotification', () => ({
    useNotification: () => ({
        getNotifications: vi.fn().mockResolvedValue([rule]),
        isLoadingNotifications: ref(false),
        upsertNotification,
        deleteNotification: vi.fn(),
    }),
}));

vi.mock('@/composables/useIntegration', () => ({
    useIntegration: () => ({getIntegrations: vi.fn().mockResolvedValue([{integrationId: 'int-1', label: 'I', role: 'owner'}])}),
}));

describe('NotificationsPage', () => {
    it("toggling the rule's enabled state keeps include_log_details", async () => {
        upsertNotification.mockResolvedValue(rule);
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
});
