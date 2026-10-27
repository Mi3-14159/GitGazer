import {getGithubSettings} from '@/domains/apps/github-settings';
import type {AppEnv} from '@/shared/hono/env';
import {BadRequestError, InternalServerError, UnauthorizedError} from '@/shared/errors';
import {getLogger} from '@gitgazer/backend-core/logger';
import {RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import * as crypto from 'crypto';
import type {MiddlewareHandler} from 'hono';

export const verifyGithubSign: MiddlewareHandler<AppEnv> = async (c, next) => {
    const logger = getLogger();
    logger.debug('running verifyGithubSign middleware');

    const integrationId = c.req.param('integrationId');
    if (!integrationId) {
        throw new BadRequestError('Missing integration ID in path parameters');
    }

    const settings = await withRlsTransaction({
        integrationIds: [integrationId],
        callback: async (tx: RdsTransaction) => {
            return await getGithubSettings(tx, integrationId);
        },
    });

    if (!settings?.secret) {
        throw new InternalServerError('Integration secret not configured');
    }

    const signature = c.req.header('x-hub-signature-256');
    const rawBody = Buffer.from(await c.req.arrayBuffer());

    if (!signature || rawBody.length === 0) {
        throw new BadRequestError('Missing signature or payload');
    }

    const isValid = validateSignature(rawBody, settings.secret, signature);
    if (!isValid) {
        throw new UnauthorizedError('Invalid signature');
    }

    await next();
};

const validateSignature = (payload: Buffer, secret: string, signature: string): boolean => {
    const hmac = crypto.createHmac('sha256', secret);
    const digestBuf = Buffer.from('sha256=' + hmac.update(payload).digest('hex'));
    const signatureBuf = Buffer.from(signature);
    if (digestBuf.length !== signatureBuf.length) return false;
    return crypto.timingSafeEqual(digestBuf, signatureBuf);
};
