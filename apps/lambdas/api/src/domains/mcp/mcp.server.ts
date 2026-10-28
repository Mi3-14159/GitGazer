import {registerMcpTools} from '@/domains/mcp/mcp.tools';
import {McpServer} from '@modelcontextprotocol/server';

const INSTRUCTIONS = [
    'Query your GitHub Actions and pull-request data with run_sql (a single read-only SELECT or WITH).',
    'Every table lives in the "github" schema, and "user" is a reserved word that must be double-quoted.',
    'Rows are multi-tenant and ids are only unique per integration, so every join must match on integration_id as well as the id column.',
].join(' ');

export const createMcpServer = (): McpServer => {
    const server = new McpServer({name: 'gitgazer-mcp', version: '1.0.0'}, {instructions: INSTRUCTIONS});
    registerMcpTools(server);
    return server;
};
