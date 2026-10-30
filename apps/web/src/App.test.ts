import App from '@/App.vue';
import {flushPromises, mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const push = vi.fn();
const currentRoute = {value: {path: '/'}};
const isAuthenticated = vi.fn();

vi.mock('vue-router', () => ({
    RouterView: {template: '<div />'},
    useRouter: () => ({push, currentRoute}),
}));

vi.mock('@/composables/useAuth', () => ({
    useAuth: () => ({isAuthenticated}),
}));

vi.mock('@/stores/settings', () => ({
    useSettingsStore: vi.fn(),
}));

describe('App auth redirect', () => {
    beforeEach(() => {
        push.mockClear();
        isAuthenticated.mockReset().mockResolvedValue(false);
    });

    it.each(['/login', '/invite/abc', '/mcp/connect'])('does not redirect a logged-out user away from %s', async (path) => {
        currentRoute.value.path = path;
        mount(App);
        await flushPromises();

        expect(push).not.toHaveBeenCalled();
    });

    it('redirects a logged-out user from other pages to /login', async () => {
        currentRoute.value.path = '/workflows';
        mount(App);
        await flushPromises();

        expect(push).toHaveBeenCalledWith('/login');
    });
});
