import PendingInvitationCard from '@/components/users/PendingInvitationCard.vue';
import type {Invitation} from '@/types/user';
import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

const invitation: Invitation = {
    id: 'inv-1',
    role: 'member',
    integrationIds: [],
    invitedBy: 'Ada Lovelace',
    invitedAt: '2026-01-01T00:00:00Z',
    expiresAt: '2026-01-08T00:00:00Z',
    status: 'pending',
};

function mountCard(props: {invitation: Invitation; readonly?: boolean}) {
    return mount(PendingInvitationCard, {
        props,
        global: {
            stubs: {
                Card: {template: '<div><slot /></div>'},
                CardContent: {template: '<div><slot /></div>'},
                Badge: {template: '<span><slot /></span>'},
                Button: {template: '<button><slot /></button>'},
                DropdownMenu: {template: '<div><slot name="trigger" /><slot /></div>'},
                DropdownMenuItem: {template: '<div><slot /></div>'},
                DropdownMenuSeparator: true,
            },
        },
    });
}

describe('PendingInvitationCard hidden email', () => {
    it('shows "Pending invitation" and no link-only marker to a readonly viewer', () => {
        const wrapper = mountCard({invitation, readonly: true});

        expect(wrapper.text()).toContain('Pending invitation');
        expect(wrapper.text()).not.toContain('Link-only invitation');
        expect(wrapper.find('.lucide-link').exists()).toBe(false);
    });

    it('says "Invited" to a readonly viewer, who never sees the email', () => {
        expect(mountCard({invitation, readonly: true}).text()).toContain('Invited');
        expect(mountCard({invitation, readonly: true}).text()).not.toContain('Created');
    });

    it('says "Sent" or "Created" to an editor, by whether an email was sent', () => {
        expect(mountCard({invitation: {...invitation, email: 'a@example.com'}}).text()).toContain('Sent');
        expect(mountCard({invitation}).text()).toContain('Created');
    });

    it('shows the link-only marker to an editor', () => {
        const wrapper = mountCard({invitation});

        expect(wrapper.text()).toContain('Link-only invitation');
        expect(wrapper.find('.lucide-link').exists()).toBe(true);
    });
});
