import {getIntegrations} from '@/clients/dynamodb';
import {getLogger} from '@/logger';
import {HttpStatusCodes} from '@aws-lambda-powertools/event-handler/http';
import {Middleware, NextFunction} from '@aws-lambda-powertools/event-handler/lib/cjs/types/http';
import {RequestContext} from '@aws-lambda-powertools/event-handler/types';
import {APIGatewayProxyEventV2WithJWTAuthorizer} from 'aws-lambda';
import * as crypto from 'crypto';

export const verifyGithubSign: Middleware = async ({reqCtx, next}: {reqCtx: RequestContext; next: NextFunction}) => {
    const logger = getLogger(); // Get logger at runtime
    logger.debug('running verifyGithubSign middleware');
    const event = reqCtx.event as APIGatewayProxyEventV2WithJWTAuthorizer;
    const {pathParameters} = event;

    if (!pathParameters?.integrationId) {
        return new Response('Bad request: Missing integration ID.', {
            status: HttpStatusCodes.BAD_REQUEST,
        });
    }

    const integrationId = pathParameters.integrationId;
    const parameter = await getIntegrations([integrationId]);
    const secret = parameter?.[0]?.secret;
    if (!secret) {
        return new Response('Bad request: integration not found.', {
            status: HttpStatusCodes.BAD_REQUEST,
        });
    }

    const signature = event.headers['x-hub-signature-256'];
    const payload = event.body;

    if (!signature || !payload) {
        return new Response('Bad request: Missing signature or payload.', {
            status: HttpStatusCodes.BAD_REQUEST,
        });
    }

    const isValid = validateSignature(payload, secret, signature);

    if (!isValid) {
        return new Response('Unauthorized: Invalid signature.', {
            status: HttpStatusCodes.UNAUTHORIZED,
        });
    }

    await next();
};

const validateSignature = (payload: string, secret: string, signature: string): boolean => {
    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
};
