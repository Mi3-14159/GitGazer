import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda/trigger/api-gateway-proxy';
import * as crypto from 'crypto';
import {IntegrationSecret} from './types';
import {getLogger} from './logger';

const log = getLogger();

export const authorize = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult | undefined> => {
    const integrationId = event.path.replace('/api/import/', '');
    const parameter = await loadParameter(integrationId);
    const {secret} = parameter;
    if (!secret) {
        return {
            statusCode: 400,
            body: 'Bad request: integration not found.',
        };
    }

    const signature = event.headers['X-Hub-Signature-256'];
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

const loadParameter = async (intergrationId: string): Promise<IntegrationSecret> => {
    const parameterName = `${process.env.SSM_PARAMETER_GH_WEBHOOK_SECRET_NAME_PREFIX}${intergrationId}`;
    const url = `http://localhost:2773/systemsmanager/parameters/get?name=${encodeURIComponent(parameterName)}&withDecryption=true`;
    log.info('load parameter', url);

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'X-Aws-Parameters-Secrets-Token': process.env.AWS_SESSION_TOKEN,
        },
    });

    if (!response.ok) {
        log.error('failed to load parameter', response.statusText);
        return null;
    }

    const {Parameter} = await response.json();
    const {Value} = Parameter;
    return JSON.parse(Value);
};
