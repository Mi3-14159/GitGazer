import {getIntegrations} from '@/clients/dynamodb';
import {getLogger} from '@/logger';
import {BadRequestError, InternalServerError, UnauthorizedError} from '@aws-lambda-powertools/event-handler/http';
import {Middleware} from '@aws-lambda-powertools/event-handler/types';
import {APIGatewayProxyEventV2} from 'aws-lambda';
import * as crypto from 'crypto';

export const verifyGithubSign: Middleware = async ({reqCtx, next}) => {
    const logger = getLogger(); // Get logger at runtime
    logger.debug('running verifyGithubSign middleware');
    const event = reqCtx.event as APIGatewayProxyEventV2;
    const {pathParameters} = event;

    if (!pathParameters?.integrationId) {
        throw new BadRequestError('Missing integration ID in path parameters');
    }

    const integrationId = pathParameters.integrationId;
    const integrations = await getIntegrations([integrationId]);
    if (!integrations || integrations.length === 0) {
        throw new BadRequestError('Integration not found');
    }

    if (!integrations[0].secret) {
        throw new InternalServerError('Integration secret not configured');
    }

    const signature = event.headers['x-hub-signature-256'];
    const payload = event.body;

    if (!signature || !payload) {
        throw new BadRequestError('Missing signature or payload');
    }

    const isValid = validateSignature(payload, integrations[0].secret, signature);
    if (!isValid) {
        throw new UnauthorizedError('Invalid signature');
    }

    await next();
};

const validateSignature = (payload: string, secret: string, signature: string): boolean => {
    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
};
