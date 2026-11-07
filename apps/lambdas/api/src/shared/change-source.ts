export type ChangeSource = 'mcp';

export const viaSuffix = (source?: ChangeSource): string => (source === 'mcp' ? ' via MCP' : '');
