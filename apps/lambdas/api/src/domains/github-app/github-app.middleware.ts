import type {AppEnv} from '@/shared/hono/env';
import {BadRequestError, InternalServerError, UnauthorizedError} from '@/shared/errors';
import config from '@gitgazer/backend-core/config';
import {getLogger} from '@gitgazer/backend-core/logger';
import * as crypto from 'crypto';
import type {MiddlewareHandler} from 'hono';

export const verifyGithubAppSignature: MiddlewareHandler<AppEnv> = async (c, next) => {
    const logger = getLogger();
    logger.debug('running verifyGithubAppSignature middleware');

    const {webhookSecret} = config.get('githubApp');
    if (!webhookSecret) {
        throw new InternalServerError('GH_APP_WEBHOOK_SECRET is not configured');
    }

    const signature = c.req.header('x-hub-signature-256');
    const rawBody = Buffer.from(await c.req.arrayBuffer());

    if (!signature || rawBody.length === 0) {
        throw new BadRequestError('Missing signature or payload');
    }

    const hmac = crypto.createHmac('sha256', webhookSecret);
    const digestBuf = Buffer.from('sha256=' + hmac.update(rawBody).digest('hex'));
    const signatureBuf = Buffer.from(signature);

    if (digestBuf.length !== signatureBuf.length || !crypto.timingSafeEqual(digestBuf, signatureBuf)) {
        throw new UnauthorizedError('Invalid signature');
    }

    await next();
};
