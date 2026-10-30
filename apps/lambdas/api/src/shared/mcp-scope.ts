// Defined by the `gitgazer-mcp` Cognito resource server in infra/cognito.tf.
export const MCP_SCOPE = 'gitgazer-mcp/read';
export const MCP_WRITE_SCOPE = 'gitgazer-mcp/write';

export const READ_SESSION_SCOPES = ['openid', 'email', 'profile', MCP_SCOPE] as const;
export const ADVERTISED_SCOPES = [...READ_SESSION_SCOPES, MCP_WRITE_SCOPE] as const;
