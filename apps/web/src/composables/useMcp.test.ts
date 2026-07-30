import {beforeEach, describe, expect, it, vi} from 'vitest';

const getIntegrations = vi.fn();

vi.mock('@/composables/useIntegration', () => ({
    useIntegration: () => ({getIntegrations}),
}));

/**
 * useMcp keeps the dialog state, the dismissal flag and the integration probe in
 * module scope, so every case needs a fresh module registry.
 */
async function freshUseMcp() {
    vi.resetModules();
    const module = await import('@/composables/useMcp');
    return module;
}

describe('useMcp', () => {
    beforeEach(() => {
        localStorage.clear();
        getIntegrations.mockReset();
    });

    it('derives the MCP endpoint from the REST API base', async () => {
        const {mcpUrl} = await freshUseMcp();
        expect(mcpUrl).toBe('https://api.test.local/mcp');
    });

    it('embeds the endpoint in every client snippet', async () => {
        const {mcpUrl, mcpClients} = await freshUseMcp();
        for (const client of mcpClients) {
            expect(client.code).toContain(mcpUrl);
        }
    });

    it('emits a valid VS Code server config', async () => {
        const {mcpUrl, mcpClients} = await freshUseMcp();
        const vscode = mcpClients.find((c) => c.id === 'vscode');
        expect(JSON.parse(vscode!.code)).toEqual({servers: {gitgazer: {type: 'http', url: mcpUrl}}});
    });

    it('hides the hint until the user is known to have an integration', async () => {
        const {useMcp} = await freshUseMcp();
        getIntegrations.mockResolvedValue([{integrationId: 'a'}]);

        const {showHint, probeIntegrations} = useMcp();
        expect(showHint.value).toBe(false);

        await probeIntegrations();
        expect(showHint.value).toBe(true);
    });

    it('keeps the hint hidden for users without integrations', async () => {
        const {useMcp} = await freshUseMcp();
        getIntegrations.mockResolvedValue([]);

        const {showHint, probeIntegrations} = useMcp();
        await probeIntegrations();
        expect(showHint.value).toBe(false);
    });

    it('keeps the hint hidden when the probe fails', async () => {
        const {useMcp} = await freshUseMcp();
        getIntegrations.mockRejectedValue(new Error('offline'));

        const {showHint, probeIntegrations} = useMcp();
        await expect(probeIntegrations()).resolves.toBeUndefined();
        expect(showHint.value).toBe(false);
    });

    it('probes only once per session', async () => {
        const {useMcp} = await freshUseMcp();
        getIntegrations.mockResolvedValue([{integrationId: 'a'}]);

        const {probeIntegrations} = useMcp();
        await Promise.all([probeIntegrations(), probeIntegrations()]);
        await useMcp().probeIntegrations();

        expect(getIntegrations).toHaveBeenCalledTimes(1);
    });

    it('persists dismissal so the hint stays gone on reload', async () => {
        const first = await freshUseMcp();
        getIntegrations.mockResolvedValue([{integrationId: 'a'}]);

        const {showHint, dismissHint, probeIntegrations} = first.useMcp();
        await probeIntegrations();
        dismissHint();
        expect(showHint.value).toBe(false);

        // Simulate a reload: the flag is read from localStorage at module load.
        const reloaded = await freshUseMcp();
        const afterReload = reloaded.useMcp();
        await afterReload.probeIntegrations();
        expect(afterReload.showHint.value).toBe(false);
    });
});
