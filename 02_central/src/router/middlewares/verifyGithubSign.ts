import {getLogger} from '@/logger';
import {SSMIntegrationSecret} from '@/types';
import {fetchWithRetry} from '@/utils/fetch';
import {GetParameterCommand, SSMClient} from '@aws-sdk/client-ssm';
import {APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2} from 'aws-lambda/trigger/api-gateway-proxy';
import * as crypto from 'crypto';

const ssmClient = new SSMClient({});

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
    const parameter = await loadParameter(integrationId);
    const secret = parameter?.secret;
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

const loadParameter = async (integrationId: string): Promise<SSMIntegrationSecret | undefined> => {
    const parameterName = `${process.env.SSM_PARAMETER_GH_WEBHOOK_SECRET_NAME_PREFIX}${integrationId}`;
    if (process.env.ENVIRONMENT === 'dev') {
        return getParameterBySdk(parameterName);
    }
    return getParameterFromCache(parameterName);
};

const getParameterFromCache = async (parameterName: string): Promise<SSMIntegrationSecret | undefined> => {
    const logger = getLogger(); // Get logger at runtime
    const url = `http://localhost:2773/systemsmanager/parameters/get?name=${encodeURIComponent(parameterName)}&withDecryption=true`;
    logger.info({message: 'load parameter', url});

    const response = await fetchWithRetry(url, {
        method: 'GET',
        headers: {
            'X-Aws-Parameters-Secrets-Token': process.env.AWS_SESSION_TOKEN ?? '',
        },
    });

    if (!response.ok) {
        logger.error({message: 'failed to load parameter', parameterName, status: response.status, statusText: response.statusText});
        return undefined;
    }

    const {Parameter} = await response.json();
    const {Value} = Parameter;
    return JSON.parse(Value);
};

const getParameterBySdk = async (parameterName: string): Promise<SSMIntegrationSecret | undefined> => {
    const logger = getLogger(); // Get logger at runtime
    const command = new GetParameterCommand({
        Name: parameterName,
        WithDecryption: true,
    });

    try {
        const response = await ssmClient.send(command);
        if (!response.Parameter?.Value) {
            logger.error(`requested parameter has no value: ${parameterName}`);
            return undefined;
        }

        return JSON.parse(response.Parameter.Value);
    } catch (error) {
        logger.error({message: 'failed to load parameter', error});
        return undefined;
    }
};
