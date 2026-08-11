import {validateMcpHeaders} from '@/domains/mcp/mcp.headers';
import {describe, expect, it} from 'vitest';

const VERSION = '2026-07-28';
const base = {'mcp-protocol-version': VERSION, 'mcp-method': 'tools/list'};

describe('validateMcpHeaders', () => {
    it('accepts a request whose headers mirror the body', () => {
        expect(validateMcpHeaders(base, 'tools/list', {}, VERSION)).toBeNull();
    });

    it('accepts headers regardless of name casing', () => {
        const headers = {'MCP-Protocol-Version': VERSION, 'Mcp-Method': 'tools/list'};
        expect(validateMcpHeaders(headers, 'tools/list', {}, VERSION)).toBeNull();
    });

    it('rejects a missing MCP-Protocol-Version', () => {
        expect(validateMcpHeaders({'mcp-method': 'tools/list'}, 'tools/list', {}, VERSION)).toMatch(/MCP-Protocol-Version/);
    });

    it('rejects a protocol version that disagrees with the body _meta', () => {
        const headers = {...base, 'mcp-protocol-version': '2025-11-25'};
        expect(validateMcpHeaders(headers, 'tools/list', {}, VERSION)).toMatch(/MCP-Protocol-Version/);
    });

    it('rejects a missing Mcp-Method', () => {
        expect(validateMcpHeaders({'mcp-protocol-version': VERSION}, 'tools/list', {}, VERSION)).toMatch(/Mcp-Method/);
    });

    it('rejects an Mcp-Method that disagrees with the body', () => {
        expect(validateMcpHeaders(base, 'tools/call', {name: 'run_sql'}, VERSION)).toMatch(/Mcp-Method/);
    });

    it('requires Mcp-Name on tools/call', () => {
        const headers = {...base, 'mcp-method': 'tools/call'};
        expect(validateMcpHeaders(headers, 'tools/call', {name: 'run_sql'}, VERSION)).toMatch(/Mcp-Name/);
    });

    it('rejects an Mcp-Name that disagrees with the body', () => {
        const headers = {...base, 'mcp-method': 'tools/call', 'mcp-name': 'list_tables'};
        expect(validateMcpHeaders(headers, 'tools/call', {name: 'run_sql'}, VERSION)).toMatch(/Mcp-Name/);
    });

    it('accepts a matching Mcp-Name', () => {
        const headers = {...base, 'mcp-method': 'tools/call', 'mcp-name': 'run_sql'};
        expect(validateMcpHeaders(headers, 'tools/call', {name: 'run_sql'}, VERSION)).toBeNull();
    });

    it('decodes the base64 sentinel before comparing Mcp-Name', () => {
        const encoded = `=?base64?${Buffer.from('héllo', 'utf-8').toString('base64')}?=`;
        const headers = {...base, 'mcp-method': 'tools/call', 'mcp-name': encoded};
        expect(validateMcpHeaders(headers, 'tools/call', {name: 'héllo'}, VERSION)).toBeNull();
        expect(validateMcpHeaders(headers, 'tools/call', {name: 'other'}, VERSION)).toMatch(/Mcp-Name/);
    });

    it('skips the Mcp-Name check when the body has no usable name', () => {
        const headers = {...base, 'mcp-method': 'tools/call'};
        expect(validateMcpHeaders(headers, 'tools/call', {}, VERSION)).toBeNull();
    });
});
