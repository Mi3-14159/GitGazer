import {getGithubSettings} from '@/domains/apps/github-settings';
import {getLogger} from '@gitgazer/backend-core/logger';
import {BadRequestError, InternalServerError, UnauthorizedError} from '@aws-lambda-powertools/event-handler/http';
import {Middleware} from '@aws-lambda-powertools/event-handler/types';
import {RdsTransaction, withRlsTransaction} from '@gitgazer/db/client';
import {APIGatewayProxyEventV2} from 'aws-lambda';
import * as crypto from 'crypto';

export const verifyGithubSign: Middleware = async ({reqCtx, next}) => {
    const logger = getLogger();
    logger.debug('running verifyGithubSign middleware');
    const event = reqCtx.event as APIGatewayProxyEventV2;
    const {pathParameters} = event;

    if (!pathParameters?.integrationId) {
        throw new BadRequestError('Missing integration ID in path parameters');
    }

    const integrationId = pathParameters.integrationId;
    const settings = await withRlsTransaction({
        integrationIds: [integrationId],
        callback: async (tx: RdsTransaction) => {
            return await getGithubSettings(tx, integrationId);
        },
    });

    if (!settings?.secret) {
        throw new InternalServerError('Integration secret not configured');
    }

    const signature = event.headers['x-hub-signature-256'];
    const payload = event.body;

    if (!signature || !payload) {
        throw new BadRequestError('Missing signature or payload');
    }

    const rawBody = event.isBase64Encoded ? Buffer.from(payload, 'base64') : Buffer.from(payload, 'utf-8');
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
