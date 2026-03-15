import convict from 'convict';

import {getSecretValue} from '@/clients/secrets-manager';

/**
 * Application configuration schema managed by convict.
 *
 * Configuration priority (highest to lowest):
 *   1. Environment variables  (override everything)
 *   2. AWS Secrets Manager    (loaded via loadConfig())
 *   3. Schema defaults        (fallback)
 *
 * Set CONFIG_SECRET_ARN to the ARN of an AWS Secrets Manager secret that
 * contains a JSON object whose keys mirror the schema properties below.
 * Any individual value can be overridden at deploy-time with the corresponding
 * environment variable listed in the `env` field.
 */
const config = convict({
    environment: {
        doc: 'Application environment name',
        format: String,
        default: 'default',
        env: 'ENVIRONMENT',
    },
    corsOrigins: {
        doc: 'CORS allowed origins serialised as a JSON array string',
        format: Array,
        default: [],
        env: 'CORS_ORIGINS',
    },
    allowedFrontendOrigins: {
        doc: 'Frontend origins allowed for redirects, serialised as a JSON array string',
        format: Array,
        default: [],
        env: 'ALLOWED_FRONTEND_ORIGINS',
    },
    cognito: {
        userPoolId: {
            doc: 'AWS Cognito User Pool ID',
            format: String,
            default: '',
            env: 'COGNITO_USER_POOL_ID',
        },
        clientId: {
            doc: 'AWS Cognito App Client ID',
            format: String,
            default: '',
            env: 'COGNITO_CLIENT_ID',
        },
        clientSecret: {
            doc: 'AWS Cognito App Client Secret',
            format: String,
            default: '',
            env: 'COGNITO_CLIENT_SECRET',
            sensitive: true,
        },
        domain: {
            doc: 'AWS Cognito hosted-UI domain (e.g. myapp.auth.eu-central-1.amazoncognito.com)',
            format: String,
            default: '',
            env: 'COGNITO_DOMAIN',
        },
        redirectUri: {
            doc: 'OAuth2 redirect URI registered with Cognito',
            format: String,
            default: '',
            env: 'COGNITO_REDIRECT_URI',
        },
    },
    websocket: {
        apiDomainName: {
            doc: 'API Gateway WebSocket domain name',
            format: String,
            default: '',
            env: 'WEBSOCKET_API_DOMAIN_NAME',
        },
        apiStage: {
            doc: 'API Gateway WebSocket stage',
            format: String,
            default: '',
            env: 'WEBSOCKET_API_STAGE',
        },
    },
    uiBucketName: {
        doc: 'S3 bucket name for frontend static assets',
        format: String,
        default: '',
        env: 'UI_BUCKET_NAME',
    },
    importUrlBase: {
        doc: 'Base URL for GitHub webhook import endpoints',
        format: String,
        default: '',
        env: 'IMPORT_URL_BASE',
    },
    githubApp: {
        id: {
            doc: 'GitHub App ID',
            format: String,
            default: '',
            env: 'GH_APP_ID',
        },
        privateKey: {
            doc: 'GitHub App private key in PEM format',
            format: String,
            default: '',
            env: 'GH_APP_PRIVATE_KEY',
            sensitive: true,
        },
        webhookSecret: {
            doc: 'GitHub App webhook secret used to verify incoming signatures',
            format: String,
            default: '',
            env: 'GH_APP_WEBHOOK_SECRET',
            sensitive: true,
        },
    },
});

/**
 * Loads configuration from AWS Secrets Manager when CONFIG_SECRET_ARN is set,
 * then validates the resulting configuration.
 *
 * Environment variables always take precedence over values from Secrets Manager.
 * Call this once during Lambda cold-start before processing any requests.
 */
export const loadConfig = async (): Promise<void> => {
    const secretArn = process.env.CONFIG_SECRET_ARN;
    if (secretArn) {
        const secretValues = await getSecretValue(secretArn);
        config.load(secretValues);
    }
    config.validate({allowed: 'warn'});
};

export default config;
