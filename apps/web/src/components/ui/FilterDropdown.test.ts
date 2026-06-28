import FilterDropdown from '@/components/ui/FilterDropdown.vue';
import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

const options = [
    {value: 'failure', label: 'Failure'},
    {value: 'success', label: 'Success'},
];

function mountDropdown(props: Record<string, unknown>) {
    return mount(FilterDropdown, {
        props,
        global: {
            // Render the popover content inline so the mode toggle is queryable.
            stubs: {
                Popover: {template: '<div><slot name="trigger" /><slot /></div>'},
                SearchableCheckboxList: {template: '<div class="checkbox-list" />'},
            },
        },
    });
}

describe('FilterDropdown exclude mode', () => {
    it('does not render the include/exclude toggle unless excludable', () => {
        const wrapper = mountDropdown({modelValue: [], multiple: true, options});
        expect(wrapper.text()).not.toContain('Exclude');
    });

    it('renders an include/exclude toggle when excludable', () => {
        const wrapper = mountDropdown({modelValue: [], multiple: true, excludable: true, options});
        expect(wrapper.text()).toContain('Include');
        expect(wrapper.text()).toContain('Exclude');
    });

    it('emits the mode update when the Exclude toggle is clicked', async () => {
        const wrapper = mountDropdown({modelValue: ['failure'], multiple: true, excludable: true, mode: 'include', options});
        const excludeButton = wrapper.findAll('button').find((b) => b.text() === 'Exclude');
        await excludeButton!.trigger('click');
        expect(wrapper.emitted('update:mode')?.[0]).toEqual(['exclude']);
    });

    it('prefixes the button label with "Not:" when excluding values', () => {
        const wrapper = mountDropdown({modelValue: ['failure'], multiple: true, excludable: true, mode: 'exclude', options});
        expect(wrapper.text()).toContain('Not: Failure');
    });

    it('does not prefix the label in include mode', () => {
        const wrapper = mountDropdown({modelValue: ['failure'], multiple: true, excludable: true, mode: 'include', options});
        expect(wrapper.text()).not.toContain('Not:');
    });
});
