import {createPinia, setActivePinia} from 'pinia';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const fetchWithAuth = vi.fn();
const connect = vi.fn().mockResolvedValue(undefined);

vi.mock('@/composables/useAuth', () => ({
    useAuth: () => ({fetchWithAuth}),
}));

vi.mock('@/composables/useWebSocket', () => ({
    useWebSocket: () => ({connect}),
}));

import {useWorkflowsStore} from '@/stores/workflows';
function jsonResponse(body: unknown, ok = true, status = 200): Response {
    return {
        ok,
        status,
        json: async () => body,
    } as unknown as Response;
}

describe('useWorkflowsStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('accumulates items and advances the cursor across load-more calls', async () => {
        fetchWithAuth
            .mockResolvedValueOnce(jsonResponse({items: [{id: 1}], cursor: {id: 1}}))
            .mockResolvedValueOnce(jsonResponse({items: [{id: 2}], cursor: {id: 2}}));

        const store = useWorkflowsStore();

        await store.handleListWorkflows();
        expect(store.workflows.map((w) => w.id)).toEqual([1]);
        expect(store.hasMore).toBe(true);

        await store.handleListWorkflows();
        expect(store.workflows.map((w) => w.id)).toEqual([1, 2]);

        // The second request must carry the cursor returned by the first call.
        const secondUrl = fetchWithAuth.mock.calls[1][0] as string;
        expect(secondUrl).toContain(`cursor=${encodeURIComponent(JSON.stringify({id: 1}))}`);
    });

    it('stops paginating when the server returns no cursor', async () => {
        fetchWithAuth.mockResolvedValueOnce(jsonResponse({items: [{id: 1}], cursor: undefined}));

        const store = useWorkflowsStore();

        await store.handleListWorkflows();

        expect(store.hasMore).toBe(false);

        // hasMore is false, so no further request is made.
        await store.handleListWorkflows();
        expect(fetchWithAuth).toHaveBeenCalledTimes(1);
    });

    it('resets accumulated items and cursor when filters change', async () => {
        fetchWithAuth
            .mockResolvedValueOnce(jsonResponse({items: [{id: 1}], cursor: {id: 1}}))
            .mockResolvedValueOnce(jsonResponse({items: [{id: 99}], cursor: undefined}));

        const store = useWorkflowsStore();

        await store.handleListWorkflows();
        expect(store.workflows.map((w) => w.id)).toEqual([1]);

        await store.setFilters({status: ['failure']});

        expect(store.workflows.map((w) => w.id)).toEqual([99]);
        const filteredUrl = fetchWithAuth.mock.calls[1][0] as string;
        expect(filteredUrl).toContain('status=failure');
        // Cursor was reset before refetching, so it is absent from the request.
        expect(filteredUrl).not.toContain('cursor=');
    });

    it('throws when the workflows request fails', async () => {
        fetchWithAuth.mockResolvedValueOnce(jsonResponse({}, false, 500));

        const store = useWorkflowsStore();

        await expect(store.handleListWorkflows()).rejects.toThrow('Failed to fetch workflows: 500');
    });
});
