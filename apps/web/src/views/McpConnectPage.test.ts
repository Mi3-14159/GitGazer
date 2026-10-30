import McpConnectPage from '@/views/McpConnectPage.vue';
import {mount} from '@vue/test-utils';
import {describe, expect, it, vi} from 'vitest';

const route = {query: {request: 'signed-blob'} as Record<string, string>};

vi.mock('vue-router', () => ({
    useRoute: () => route,
}));

describe('McpConnectPage', () => {
    it('preselects read only and labels the button "Allow read access"', () => {
        route.query = {request: 'signed-blob'};
        const wrapper = mount(McpConnectPage);

        expect((wrapper.find('input[value="read"]').element as HTMLInputElement).checked).toBe(true);
        expect((wrapper.find('input[value="write"]').element as HTMLInputElement).checked).toBe(false);
        expect(wrapper.find('button[type="submit"]').text()).toBe('Allow read access');
    });

    it('switches the button to "Allow read & write access" when read & write is chosen', async () => {
        route.query = {request: 'signed-blob'};
        const wrapper = mount(McpConnectPage);

        await wrapper.find('input[value="write"]').setValue(true);

        expect(wrapper.find('button[type="submit"]').text()).toBe('Allow read & write access');
    });

    it('posts the request and session to the authorize endpoint', () => {
        route.query = {request: 'signed-blob'};
        const wrapper = mount(McpConnectPage);
        const form = wrapper.find('form');

        expect(form.attributes('method')).toBe('post');
        expect(form.attributes('action')).toMatch(/\/mcp\/oauth\/authorize$/);
        expect((wrapper.find('input[name="request"]').element as HTMLInputElement).value).toBe('signed-blob');
        expect(wrapper.findAll('input[type="radio"]').map((i) => [i.attributes('name'), i.attributes('value')])).toEqual([
            ['session', 'read'],
            ['session', 'write'],
        ]);
    });

    it('shows an error instead of the form when the request is missing', () => {
        route.query = {};
        const wrapper = mount(McpConnectPage);

        expect(wrapper.text()).toContain('This link is incomplete. Start the connection from your MCP client again.');
        expect(wrapper.find('form').exists()).toBe(false);
    });
});
