import UserCard from '@/components/users/UserCard.vue';
import type {TeamMember, UserRole} from '@/types/user';
import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

function makeUser(role: UserRole): TeamMember {
    return {
        id: `user-${role}`,
        email: `${role}@test.local`,
        name: 'Ada Lovelace',
        role,
        status: 'active',
        integrationIds: [],
    };
}

function mountCard(props: {user: TeamMember; readonly?: boolean; callerRole?: UserRole}) {
    return mount(UserCard, {
        props,
        global: {
            // Stub child UI components so the test focuses on UserCard's role gating.
            stubs: {
                Card: {template: '<div><slot /></div>'},
                CardContent: {template: '<div><slot /></div>'},
                Badge: {template: '<span><slot /></span>'},
                Button: {template: '<button><slot /></button>'},
                DropdownMenu: {template: '<div class="dropdown-menu"><slot name="trigger" /><slot /></div>'},
                DropdownMenuItem: {template: '<div class="dropdown-item"><slot /></div>'},
                DropdownMenuSeparator: true,
            },
        },
    });
}

describe('UserCard role gating', () => {
    it('hides the actions menu for owners', () => {
        const wrapper = mountCard({user: makeUser('owner'), callerRole: 'admin'});
        expect(wrapper.find('.dropdown-menu').exists()).toBe(false);
    });

    it('hides the actions menu when readonly', () => {
        const wrapper = mountCard({user: makeUser('member'), readonly: true, callerRole: 'admin'});
        expect(wrapper.find('.dropdown-menu').exists()).toBe(false);
    });

    it('shows the actions menu for non-owners when not readonly', () => {
        const wrapper = mountCard({user: makeUser('member'), callerRole: 'admin'});
        expect(wrapper.find('.dropdown-menu').exists()).toBe(true);
    });

    it('only offers roles at or below the caller privilege level', () => {
        // An admin caller cannot promote anyone to owner; offered roles exclude it.
        const wrapper = mountCard({user: makeUser('viewer'), callerRole: 'admin'});
        const items = wrapper.findAll('.dropdown-item').map((i) => i.text());
        const roleChanges = items.filter((t) => t.startsWith('Change to'));
        expect(roleChanges).toContain('Change to Admin');
        expect(roleChanges).toContain('Change to Member');
        expect(roleChanges).not.toContain('Change to Owner');
        // The user's own current role is never offered.
        expect(roleChanges).not.toContain('Change to Viewer');
    });

    it('emits changeRole with the selected role when a menu item is clicked', async () => {
        const user = makeUser('viewer');
        const wrapper = mountCard({user, callerRole: 'admin'});

        const memberItem = wrapper.findAll('.dropdown-item').find((i) => i.text() === 'Change to Member');
        expect(memberItem).toBeDefined();
        await memberItem!.trigger('click');

        expect(wrapper.emitted('changeRole')).toEqual([[user.id, 'member']]);
    });
});
