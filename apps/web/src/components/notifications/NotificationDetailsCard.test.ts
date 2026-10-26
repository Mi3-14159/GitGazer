import NotificationDetailsCard from '@/components/notifications/NotificationDetailsCard.vue';
import type {NotificationRule} from '@common/types';
import {flushPromises, mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const listApps = vi.fn();

vi.mock('@/composables/useIntegrationApps', () => ({
    useIntegrationApps: () => ({listApps}),
}));

const webhookApp = {
    appId: 'app-1',
    type: 'webhook',
    createdAt: '',
    handles: [
        {handleId: 'h-1', appId: 'app-1', name: 'Team Alpha', url: null, ruleCount: 1},
        {handleId: 'h-2', appId: 'app-1', name: 'Team Beta', url: null, ruleCount: 0},
    ],
};

beforeEach(() => {
    listApps.mockReset();
    listApps.mockResolvedValue([webhookApp]);
});

const HINT = 'Everyone in the Slack channel will see error lines from the job log. Requires the GitGazer GitHub App.';

function mountCard(existingRule?: NotificationRule, onSave = vi.fn()) {
    return mount(NotificationDetailsCard, {
        props: {
            integrations: [{integrationId: 'int-1', label: 'Integration'}] as never,
            onClose: vi.fn(),
            onSave,
            existingRule,
        },
        global: {stubs: {RouterLink: {props: ['to'], template: '<a :href="to"><slot /></a>'}}},
    });
}

describe('NotificationDetailsCard include_log_details', () => {
    it('new rule defaults include_log_details to true', async () => {
        const onSave = vi.fn();
        const wrapper = mountCard(undefined, onSave);

        await wrapper.find('input[placeholder="e.g., Team Alpha CI alerts"]').setValue('Alerts');
        await wrapper.find('select').setValue('int-1');
        await flushPromises();
        await wrapper.find('select#notification-handle').setValue('h-1');
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
            handleIds: ['h-1'],
        } as unknown as NotificationRule;

        const wrapper = mountCard(rule);

        expect(wrapper.find('#include-log-details').attributes('aria-checked')).toBe('false');
    });
});

describe('NotificationDetailsCard handle selection', () => {
    function findSave(wrapper: ReturnType<typeof mountCard>) {
        return wrapper.findAll('button').find((b) => b.text() === 'Save')!;
    }

    it('saves the selected handle id', async () => {
        const onSave = vi.fn();
        const wrapper = mountCard(undefined, onSave);
        await wrapper.find('input[placeholder="e.g., Team Alpha CI alerts"]').setValue('Alerts');
        await wrapper.find('select').setValue('int-1');
        await flushPromises();

        expect(listApps).toHaveBeenCalledWith('int-1');
        await wrapper.find('select#notification-handle').setValue('h-2');
        await findSave(wrapper).trigger('click');

        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({handleIds: ['h-2'], integrationId: 'int-1'}));
    });

    it('preselects the handle of an existing rule', async () => {
        const rule = {id: 'r1', integrationId: 'int-1', label: 'Old', rule: {topics: []}, handleIds: ['h-2']} as unknown as NotificationRule;
        const wrapper = mountCard(rule);
        await flushPromises();

        expect((wrapper.find('select#notification-handle').element as HTMLSelectElement).value).toBe('h-2');
    });

    it('keeps the handles of a migrated rule until the selection changes', async () => {
        const onSave = vi.fn();
        const rule = {id: 'r1', integrationId: 'int-1', label: 'Old', rule: {topics: []}, handleIds: ['h-1', 'h-2']} as unknown as NotificationRule;
        const wrapper = mountCard(rule, onSave);
        await flushPromises();

        expect(wrapper.text()).toContain('Team Alpha, Team Beta');
        await findSave(wrapper).trigger('click');
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({handleIds: ['h-1', 'h-2']}));

        await wrapper.find('select#notification-handle').setValue('h-1');
        await findSave(wrapper).trigger('click');
        expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({handleIds: ['h-1']}));
    });

    it('shows a link to the Apps tab when the integration has no handles', async () => {
        listApps.mockResolvedValue([{appId: 'app-1', type: 'webhook', createdAt: '', handles: []}]);
        const onSave = vi.fn();
        const wrapper = mountCard(undefined, onSave);
        await wrapper.find('input[placeholder="e.g., Team Alpha CI alerts"]').setValue('Alerts');
        await wrapper.find('select').setValue('int-1');
        await flushPromises();

        expect(wrapper.find('select#notification-handle').exists()).toBe(false);
        expect(wrapper.find('a[href="/integrations/int-1/apps"]').exists()).toBe(true);
        expect(findSave(wrapper).attributes('disabled')).toBeDefined();
    });

    it('rule editor lists Slack handles under the Slack app', async () => {
        const slackApp = {
            appId: 'app-s',
            type: 'slack',
            createdAt: '',
            workspace: {teamId: 'T1', teamName: 'Acme', disconnected: false},
            handles: [{handleId: 'h-s', appId: 'app-s', name: 'CI alerts', url: null, channelName: 'ci', ruleCount: 0}],
            linkedMemberCount: 0,
            memberCount: 1,
        };
        listApps.mockResolvedValue([webhookApp, slackApp]);
        const onSave = vi.fn();
        const wrapper = mountCard(undefined, onSave);
        await wrapper.find('input[placeholder="e.g., Team Alpha CI alerts"]').setValue('Alerts');
        await wrapper.find('select').setValue('int-1');
        await flushPromises();

        const appSelect = wrapper.find('select#notification-app');
        expect(appSelect.findAll('option:not([disabled])').map((o) => o.text())).toEqual(['Webhook', 'Slack']);
        await appSelect.setValue('app-s');
        expect(
            wrapper
                .find('select#notification-handle')
                .findAll('option:not([disabled])')
                .map((o) => o.text()),
        ).toEqual(['CI alerts']);

        await wrapper.find('select#notification-handle').setValue('h-s');
        await findSave(wrapper).trigger('click');
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({handleIds: ['h-s']}));
    });

    it('warns when an existing rule lost its handles', async () => {
        const rule = {id: 'r1', integrationId: 'int-1', label: 'Old', rule: {topics: []}, handleIds: []} as unknown as NotificationRule;
        const wrapper = mountCard(rule);
        await flushPromises();

        expect(wrapper.text()).toContain('has no destination');
    });
});
