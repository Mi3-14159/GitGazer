import App from '@/App.vue';
import {flushPromises, mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createMemoryHistory, createRouter} from 'vue-router';

const isAuthenticated = vi.fn();

vi.mock('@/composables/useAuth', () => ({
    useAuth: () => ({isAuthenticated}),
}));

vi.mock('@/stores/settings', () => ({
    useSettingsStore: vi.fn(),
}));

const coldLoad = async (fullPath: string) => {
    const history = createMemoryHistory();
    history.replace(fullPath);
    const router = createRouter({history, routes: [{path: '/:pathMatch(.*)*', component: {template: '<div />'}}]});
    // Like main.ts: mount without awaiting the initial navigation.
    mount(App, {global: {plugins: [router]}});
    await flushPromises();
    return router;
};

describe('App auth redirect', () => {
    beforeEach(() => {
        isAuthenticated.mockReset().mockResolvedValue(false);
    });

    it.each(['/login', '/invite/abc', '/mcp/connect?request=x'])('does not redirect a logged-out user away from %s', async (fullPath) => {
        const router = await coldLoad(fullPath);

        expect(router.currentRoute.value.fullPath).toBe(fullPath);
    });

    it.each(['/workflows', '/mcp/connectors', '/mcp/connect-x', '/mcp/connect/x'])('redirects a logged-out user from %s to /login', async (path) => {
        const router = await coldLoad(path);

        expect(router.currentRoute.value.path).toBe('/login');
    });
});
