import DropdownMenu from '@/components/ui/DropdownMenu.vue';
import {flushPromises, mount} from '@vue/test-utils';
import {DropdownMenuItem} from 'radix-vue';
import {afterEach, describe, expect, it} from 'vitest';
import {defineComponent} from 'vue';

const Harness = defineComponent({
    components: {DropdownMenu, DropdownMenuItem},
    template: `
        <DropdownMenu>
            <template #trigger>
                <button type="button">Actions</button>
            </template>
            <DropdownMenuItem>Edit</DropdownMenuItem>
        </DropdownMenu>
    `,
});

let wrapper: ReturnType<typeof mount> | undefined;

afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    document.body.replaceChildren();
});

describe('DropdownMenu', () => {
    it('opens without v-model:open', async () => {
        wrapper = mount(Harness, {attachTo: document.body});
        await flushPromises();

        await wrapper.find('button').trigger('keydown', {key: 'Enter'});
        await flushPromises();

        expect(document.body.textContent).toContain('Edit');
    });
});
