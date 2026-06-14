import * as crypto from 'crypto';
import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@/shared/config', () => ({
    default: {get: () => ({webhookSecret: 'shh'})},
}));

function makeReqCtx(event: any) {
    return {event} as any;
}

function signatureFor(payload: string, secret: string) {
    const hmac = crypto.createHmac('sha256', secret);
    return 'sha256=' + hmac.update(payload).digest('hex');
}

describe('verifyGithubAppSignature middleware', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('calls next for a plain body with a valid signature', async () => {
        const {verifyGithubAppSignature} = await import('./github-app.middleware');
        const next = vi.fn(async () => undefined);
        const payload = JSON.stringify({action: 'created'});
        const event = {headers: {'x-hub-signature-256': signatureFor(payload, 'shh')}, body: payload};

        const out = await verifyGithubAppSignature({reqCtx: makeReqCtx(event), next} as any);

        expect(out).toBeUndefined();
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('calls next for a base64-encoded body with a signature over the decoded bytes', async () => {
        const {verifyGithubAppSignature} = await import('./github-app.middleware');
        const next = vi.fn(async () => undefined);
        const payload = JSON.stringify({action: 'created'});
        const event = {
            headers: {'x-hub-signature-256': signatureFor(payload, 'shh')},
            body: Buffer.from(payload, 'utf-8').toString('base64'),
            isBase64Encoded: true,
        };

        const out = await verifyGithubAppSignature({reqCtx: makeReqCtx(event), next} as any);

        expect(out).toBeUndefined();
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('throws UnauthorizedError for an invalid signature', async () => {
        const {verifyGithubAppSignature} = await import('./github-app.middleware');
        const next = vi.fn(async () => undefined);
        const payload = JSON.stringify({action: 'created'});
        const good = signatureFor(payload, 'shh');
        const bad = good.slice(0, -1) + (good.endsWith('0') ? '1' : '0');
        const event = {headers: {'x-hub-signature-256': bad}, body: payload};

        await expect(verifyGithubAppSignature({reqCtx: makeReqCtx(event), next} as any)).rejects.toThrow('Invalid signature');
        expect(next).not.toHaveBeenCalled();
    });
});
