import {useIntegration} from '@/composables/useIntegration';
import {computed, ref} from 'vue';

const API_ENDPOINT = import.meta.env.VITE_REST_API_ENDPOINT;
const HINT_STORAGE_KEY = 'gitgazer:mcp-hint';

export const MCP_DOCS_URL = 'https://docs.gitgazer.com/user-guide/ai-assistants';

/**
 * The MCP server is served by the same API as every other route (`/api/mcp`),
 * so the endpoint is derived from the base the app already talks to rather than
 * configured separately. Falls back to the current origin when the base is unset.
 */
function resolveMcpUrl(): string {
    const base = (API_ENDPOINT as string | undefined)?.replace(/\/+$/, '');
    return base ? `${base}/mcp` : `${window.location.origin}/api/mcp`;
}

export const mcpUrl = resolveMcpUrl();

/** Concrete questions land better than abstract capability claims — these are the pitch. */
export const mcpExampleQuestions = [
    'Which workflows failed most often in the last 7 days?',
    'Show the repositories with the most failed runs this month.',
    'List the pull requests linked to failed runs today.',
];

export interface McpClient {
    id: string;
    label: string;
    intro: string;
    /** Filename shown above the snippet, when the snippet belongs in a file. */
    fileHint?: string;
    code: string;
    outro: string;
}

export const mcpClients: McpClient[] = [
    {
        id: 'vscode',
        label: 'VS Code',
        intro: 'Add the server to your workspace:',
        fileHint: '.vscode/mcp.json',
        code: JSON.stringify({servers: {gitgazer: {type: 'http', url: mcpUrl}}}, null, 4),
        outro: 'VS Code prompts you to start the server, then opens a browser to sign in with GitHub.',
    },
    {
        id: 'claude-code',
        label: 'Claude Code',
        intro: 'Run this in your terminal:',
        code: `claude mcp add --transport http gitgazer ${mcpUrl}`,
        outro: 'Then run /mcp in a session and choose Authenticate to sign in with GitHub.',
    },
    {
        id: 'claude-desktop',
        label: 'Claude Desktop',
        intro: 'Open Settings → Connectors → Add custom connector, then paste this URL:',
        code: mcpUrl,
        outro: 'Click Connect and sign in with GitHub when prompted.',
    },
];

// Module scope: one dialog shared by every trigger, and one integration probe
// per session rather than per component mount.
const isConnectDialogOpen = ref(false);
const hintDismissed = ref(localStorage.getItem(HINT_STORAGE_KEY) === 'dismissed');
const hasIntegrations = ref<boolean | null>(null);
let integrationProbe: Promise<void> | null = null;

export function useMcp() {
    const {getIntegrations} = useIntegration();

    /**
     * There is nothing to query until the user belongs to an integration, so the
     * hint stays hidden until we know they do.
     */
    function probeIntegrations(): Promise<void> {
        integrationProbe ??= (async () => {
            try {
                const integrations = await getIntegrations();
                hasIntegrations.value = (integrations?.length ?? 0) > 0;
            } catch {
                // Fail quiet — a discovery hint is never worth surfacing an error for.
                hasIntegrations.value = false;
            }
        })();
        return integrationProbe;
    }

    const showHint = computed(() => !hintDismissed.value && hasIntegrations.value === true);

    function dismissHint() {
        hintDismissed.value = true;
        localStorage.setItem(HINT_STORAGE_KEY, 'dismissed');
    }

    function openConnectDialog() {
        isConnectDialogOpen.value = true;
    }

    return {
        mcpUrl,
        mcpClients,
        mcpExampleQuestions,
        docsUrl: MCP_DOCS_URL,
        isConnectDialogOpen,
        openConnectDialog,
        showHint,
        dismissHint,
        probeIntegrations,
    };
}
