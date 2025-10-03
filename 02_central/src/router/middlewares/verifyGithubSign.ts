import {getIntegrations} from '@/clients/dynamodb';
import {getLogger} from '@/logger';
import {APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2} from 'aws-lambda/trigger/api-gateway-proxy';
import * as crypto from 'crypto';

export const verifyGithubSign = async (event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<void | APIGatewayProxyResultV2> => {
    const logger = getLogger(); // Get logger at runtime
    logger.debug({message: 'running verifyGithubSign middleware'});
    const {pathParameters} = event;

    if (!pathParameters?.integrationId) {
        return {
            statusCode: 400,
            body: 'Bad request: Missing integration ID.',
        };
    }

    const integrationId = pathParameters.integrationId;
    const parameter = await getIntegrations([integrationId]);
    const secret = parameter?.[0]?.secret;
    if (!secret) {
        return {
            statusCode: 400,
            body: 'Bad request: integration not found.',
        };
    }

    const signature = event.headers['x-hub-signature-256'];
    const payload = event.body;

    if (!signature || !payload) {
        return {
            statusCode: 400,
            body: 'Bad request: Missing signature or payload.',
        };
    }

    const isValid = validateSignature(payload, secret, signature);

    if (!isValid) {
        return {
            statusCode: 401,
            body: 'Unauthorized: Invalid signature.',
        };
    }

    return undefined;
};

const validateSignature = (payload: string, secret: string, signature: string): boolean => {
    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
};
