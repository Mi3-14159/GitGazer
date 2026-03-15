import config from '@/shared/config';
import {getLogger} from '@/shared/logger';
import {publicRoutePrefixes} from '@/shared/middleware/public-routes';
import {ForbiddenError} from '@aws-lambda-powertools/event-handler/http';
import {Middleware} from '@aws-lambda-powertools/event-handler/types';
import {APIGatewayProxyEventV2} from 'aws-lambda';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

/**
 * CSRF protection: verify the Origin header on state-changing requests matches
 * the configured allowlist. Public routes (webhooks, auth callbacks) are exempt
 * because they use their own authentication (HMAC signatures, auth codes).
 */
export const originCheck: Middleware = async ({reqCtx, next}) => {
    const event = reqCtx.event as APIGatewayProxyEventV2;
    const method = event.requestContext?.http?.method?.toUpperCase();

    if (!method || !STATE_CHANGING_METHODS.has(method)) {
        await next();
        return;
    }

    // Public routes (webhooks, auth) have their own auth — skip origin check
    if (publicRoutePrefixes.some((prefix) => event.rawPath.startsWith(prefix))) {
        await next();
        return;
    }

    const origin = event.headers?.['origin'];
    if (!origin) {
        // No origin header (e.g. server-to-server) — allow, as cookies won't be attached
        await next();
        return;
    }

    const allowedOrigins: string[] = config.get('allowedFrontendOrigins');
    const isAllowed = allowedOrigins.some((allowed) => {
        try {
            return new URL(allowed).origin === new URL(origin).origin;
        } catch {
            return false;
        }
    });

    if (!isAllowed) {
        const logger = getLogger();
        logger.warn('Rejected request: Origin not in allowlist', {origin, method, path: event.rawPath});
        throw new ForbiddenError('Origin not allowed');
    }

    await next();
};
