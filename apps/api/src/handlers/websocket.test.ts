import {createHmac} from 'crypto';
import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@/shared/bootstrap', () => ({}));
vi.mock('@/shared/config', () => ({default: {get: () => 'test-secret'}, loadConfig: vi.fn()}));
vi.mock('@/shared/logger', () => ({getLogger: () => ({info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn()})}));
vi.mock('@gitgazer/db/client', () => ({db: {}, initDb: vi.fn()}));
vi.mock('@gitgazer/db/schema/gitgazer', () => ({wsConnections: {}}));
vi.mock('@gitgazer/db/types', () => ({WEBSOCKET_CHANNELS: ['workflow_run', 'workflow_job']}));

let mod: typeof import('./websocket');

const sign = (payloadEncoded: string) => createHmac('sha256', 'test-secret').update(payloadEncoded).digest('base64url');
const encode = (payload: object) => Buffer.from(JSON.stringify(payload)).toString('base64url');
const makeToken = (payload: object) => {
    const payloadEncoded = encode(payload);
    return `${payloadEncoded}.${sign(payloadEncoded)}`;
};

const validPayload = () => ({
    userId: 1,
    username: 'testuser',
    email: 'test@example.com',
    integrations: ['int-1'],
    exp: Math.floor(Date.now() / 1000) + 3600,
    nonce: 'abc123',
});

beforeEach(async () => {
    mod = await import('./websocket');
});

describe('validateWebSocketToken', () => {
    it('accepts a correctly signed, unexpired token', () => {
        expect(mod.validateWebSocketToken(makeToken(validPayload()))).toMatchObject({userId: 1, integrations: ['int-1']});
    });

    it('rejects a tampered (same-length) signature', () => {
        const payloadEncoded = encode(validPayload());
        const good = sign(payloadEncoded);
        const tampered = good.slice(0, -1) + (good.endsWith('A') ? 'B' : 'A');
        expect(() => mod.validateWebSocketToken(`${payloadEncoded}.${tampered}`)).toThrow('Invalid token signature');
    });

    it('rejects a wrong-length signature WITHOUT throwing from timingSafeEqual', () => {
        // Proves the length guard: a short signature must yield the controlled
        // "Invalid token signature" error, not a RangeError from timingSafeEqual.
        const payloadEncoded = encode(validPayload());
        expect(() => mod.validateWebSocketToken(`${payloadEncoded}.AAAA`)).toThrow('Invalid token signature');
    });

    it('rejects an expired token', () => {
        const expired = {...validPayload(), exp: Math.floor(Date.now() / 1000) - 10};
        expect(() => mod.validateWebSocketToken(makeToken(expired))).toThrow('Token expired');
    });

    it('rejects a malformed token (wrong number of parts)', () => {
        expect(() => mod.validateWebSocketToken('not-a-valid-token')).toThrow('Invalid token format');
    });
});
