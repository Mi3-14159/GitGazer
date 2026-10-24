import NotificationDetailsCard from '@/components/notifications/NotificationDetailsCard.vue';
import type {NotificationRule} from '@common/types';
import {mount} from '@vue/test-utils';
import {describe, expect, it, vi} from 'vitest';

const HINT = 'Everyone in the Slack channel will see error lines from the job log. Requires the GitGazer GitHub App.';

function mountCard(existingRule?: NotificationRule, onSave = vi.fn()) {
    return mount(NotificationDetailsCard, {
        props: {
            integrations: [{integrationId: 'int-1', label: 'Integration'}] as never,
            onClose: vi.fn(),
            onSave,
            existingRule,
        },
    });
}

describe('NotificationDetailsCard include_log_details', () => {
    it('new rule defaults include_log_details to true', async () => {
        const onSave = vi.fn();
        const wrapper = mountCard(undefined, onSave);

        await wrapper.find('input[placeholder="e.g., Team Alpha CI alerts"]').setValue('Alerts');
        await wrapper.find('select').setValue('int-1');
        await wrapper.find('input[placeholder="https://hooks.slack.com/..."]').setValue('https://hooks.slack.com/x');
        await wrapper
            .findAll('button')
            .find((b) => b.text() === 'Save')!
            .trigger('click');

        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({include_log_details: true}));
    });

    it('renders the "Include log details" checkbox with the hint', () => {
        const wrapper = mountCard();

        const checkbox = wrapper.find('button[role="checkbox"]#include-log-details');
        expect(checkbox.exists()).toBe(true);
        expect(checkbox.attributes('aria-checked')).toBe('true');
        expect(checkbox.attributes('aria-describedby')).toBe('include-log-details-hint');

        const label = wrapper.find('label[for="include-log-details"]');
        expect(label.text()).toBe('Include log details (error lines and AI summary)');
        expect(wrapper.find('#include-log-details-hint').text()).toBe(HINT);
    });

    it('keeps an existing rule opted out', () => {
        const rule = {
            id: 'r1',
            integrationId: 'int-1',
            label: 'Old',
            enabled: true,
            createdAt: '',
            updatedAt: '',
            ignore_dependabot: false,
            include_log_details: false,
            rule: {topics: []},
            channels: [{type: 'slack', webhook_url: 'https://hooks.slack.com/x'}],
        } as unknown as NotificationRule;

        const wrapper = mountCard(rule);

        expect(wrapper.find('#include-log-details').attributes('aria-checked')).toBe('false');
    });
});
