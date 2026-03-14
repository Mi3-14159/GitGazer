import config from '@/config';
import {getLogger} from '@/logger';
import {BadRequestError, UnauthorizedError} from '@aws-lambda-powertools/event-handler/http';
import {Middleware} from '@aws-lambda-powertools/event-handler/types';
import {APIGatewayProxyEventV2} from 'aws-lambda';
import * as crypto from 'crypto';

export const verifyGithubAppSignature: Middleware = async ({reqCtx, next}) => {
    const logger = getLogger();
    logger.debug('running verifyGithubAppSignature middleware');

    const {webhookSecret} = config.get('githubApp');
    if (!webhookSecret) {
        throw new Error('GH_APP_WEBHOOK_SECRET is not configured');
    }

    const event = reqCtx.event as APIGatewayProxyEventV2;
    const signature = event.headers['x-hub-signature-256'];
    const payload = event.body;

    if (!signature || !payload) {
        throw new BadRequestError('Missing signature or payload');
    }

    const hmac = crypto.createHmac('sha256', webhookSecret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))) {
        throw new UnauthorizedError('Invalid signature');
    }

    await next();
};
