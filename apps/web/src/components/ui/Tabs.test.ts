import Tabs from '@/components/ui/Tabs.vue';
import TabsContent from '@/components/ui/TabsContent.vue';
import TabsList from '@/components/ui/TabsList.vue';
import TabsTrigger from '@/components/ui/TabsTrigger.vue';
import {flushPromises, mount} from '@vue/test-utils';
import {afterEach, describe, expect, it} from 'vitest';
import {defineComponent, ref} from 'vue';

const Harness = defineComponent({
    components: {Tabs, TabsList, TabsTrigger, TabsContent},
    setup() {
        const tab = ref('apps');
        return {tab};
    },
    template: `
        <Tabs v-model="tab">
            <TabsList>
                <TabsTrigger value="apps">Apps</TabsTrigger>
                <TabsTrigger value="members">Members</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
            <TabsContent value="apps">Apps panel</TabsContent>
            <TabsContent value="members">Members panel</TabsContent>
            <TabsContent value="settings">Settings panel</TabsContent>
        </Tabs>
    `,
});

let wrapper: ReturnType<typeof mount> | undefined;

afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
});

describe('Tabs', () => {
    it('links each tab to its panel', async () => {
        wrapper = mount(Harness, {attachTo: document.body});
        await flushPromises();

        const tab = wrapper.get('[role="tab"][aria-selected="true"]');
        const panel = wrapper.get('[role="tabpanel"]:not([hidden])');
        expect(panel.attributes('id')).toBeTruthy();
        expect(tab.attributes('id')).toBeTruthy();
        expect(tab.attributes('aria-controls')).toBe(panel.attributes('id'));
        expect(panel.attributes('aria-labelledby')).toBe(tab.attributes('id'));
        expect(panel.text()).toBe('Apps panel');
    });

    it('moves focus and selection to the next tab with ArrowRight', async () => {
        wrapper = mount(Harness, {attachTo: document.body});
        await flushPromises();
        const tabs = wrapper.findAll('[role="tab"]');

        (tabs[0].element as HTMLElement).focus();
        await tabs[0].trigger('keydown', {key: 'ArrowRight'});
        await flushPromises();

        expect(document.activeElement).toBe(tabs[1].element);
        expect(tabs.map((t) => t.attributes('aria-selected'))).toEqual(['false', 'true', 'false']);
        expect(tabs.map((t) => t.attributes('tabindex'))).toEqual(['-1', '0', '-1']);
        expect(wrapper.get('[role="tabpanel"]:not([hidden])').text()).toBe('Members panel');
        expect((wrapper.vm as unknown as {tab: string}).tab).toBe('members');
    });
});
