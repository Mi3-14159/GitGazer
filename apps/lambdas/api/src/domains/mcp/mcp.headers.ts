const BASE64_SENTINEL = /^=\?base64\?(.*)\?=$/;

/** Header values that are not plain ASCII are transmitted as `=?base64?<value>?=`. */
const decodeHeaderValue = (value: string): string => {
    const match = BASE64_SENTINEL.exec(value);
    return match ? Buffer.from(match[1], 'base64').toString('utf-8') : value;
};

// API Gateway lowercases header names, but local dev callers and tests may not.
const read = (headers: Record<string, string | undefined>, name: string): string | undefined =>
    headers[name] ?? Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];

/**
 * Streamable HTTP (protocol 2026-07-28) mirrors selected body fields into headers so that
 * intermediaries can route and rate-limit without parsing the body. A mismatch means two
 * components would act on different values, so it must be rejected rather than reconciled.
 *
 * Returns an error message, or `null` when the request is valid.
 */
export const validateMcpHeaders = (
    headers: Record<string, string | undefined>,
    method: string,
    params: Record<string, unknown>,
    protocolVersion: string,
): string | null => {
    const headerVersion = read(headers, 'mcp-protocol-version');
    if (headerVersion === undefined) return 'Missing required header: MCP-Protocol-Version';
    if (headerVersion !== protocolVersion) {
        return `MCP-Protocol-Version header '${headerVersion}' does not match the protocol version in the request _meta`;
    }

    const headerMethod = read(headers, 'mcp-method');
    if (headerMethod === undefined) return 'Missing required header: Mcp-Method';
    if (headerMethod !== method) return `Mcp-Method header '${headerMethod}' does not match body method '${method}'`;

    // Mcp-Name mirrors params.name; a malformed name is reported by the tool dispatch instead.
    if (method !== 'tools/call' || typeof params.name !== 'string') return null;
    const headerName = read(headers, 'mcp-name');
    if (headerName === undefined) return 'Missing required header: Mcp-Name';
    if (decodeHeaderValue(headerName) !== params.name) return `Mcp-Name header does not match body value '${params.name}'`;
    return null;
};
