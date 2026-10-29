import convict from 'convict';

import {getSecretValue} from './clients/secrets-manager.client';

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
        mcpClientId: {
            doc: 'AWS Cognito App Client ID for the public MCP OAuth client (PKCE, no secret)',
            format: String,
            default: '',
            env: 'COGNITO_MCP_CLIENT_ID',
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
    slackApp: {
        clientId: {
            doc: 'Slack app client ID',
            format: String,
            default: '',
            env: 'SLACK_APP_CLIENT_ID',
        },
        clientSecret: {
            doc: 'Slack app client secret',
            format: String,
            default: '',
            env: 'SLACK_APP_CLIENT_SECRET',
            sensitive: true,
        },
        installRedirectUri: {
            doc: 'OAuth redirect URI registered with the Slack app for workspace installs',
            format: String,
            default: '',
            env: 'SLACK_APP_INSTALL_REDIRECT_URI',
        },
        signInRedirectUri: {
            doc: 'OAuth redirect URI registered with the Slack app for Sign in with Slack',
            format: String,
            default: '',
            env: 'SLACK_APP_SIGN_IN_REDIRECT_URI',
        },
    },
    tokenKmsKeyId: {
        doc: 'KMS key ID or ARN used to encrypt Slack bot tokens at rest',
        format: String,
        default: '',
        env: 'TOKEN_KMS_KEY_ID',
    },
    alerts: {
        bedrockModelId: {
            doc: 'Bedrock model or inference profile ID used to summarize failed job logs',
            format: String,
            default: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0',
            env: 'ALERTS_BEDROCK_MODEL_ID',
        },
        summaryDailyCap: {
            doc: 'Maximum AI failure summaries generated per day',
            format: Number,
            default: 1000,
            env: 'ALERTS_SUMMARY_DAILY_CAP',
        },
        logFetchTimeoutMs: {
            doc: 'Timeout for downloading a job log from GitHub, in milliseconds',
            format: Number,
            default: 5000,
            env: 'ALERTS_LOG_FETCH_TIMEOUT_MS',
        },
        bedrockTimeoutMs: {
            doc: 'Timeout for a Bedrock summary call, in milliseconds',
            format: Number,
            default: 8000,
            env: 'ALERTS_BEDROCK_TIMEOUT_MS',
        },
        minRemainingMsForEnrichment: {
            doc: 'Skip log enrichment when less than this many milliseconds remain in the invocation',
            format: Number,
            default: 30000,
            env: 'ALERTS_MIN_REMAINING_MS_FOR_ENRICHMENT',
        },
        concurrency: {
            doc: 'Maximum alerts processed concurrently per batch',
            format: Number,
            default: 5,
            env: 'ALERTS_CONCURRENCY',
        },
    },
    githubOAuthApp: {
        clientId: {
            doc: 'GitHub OAuth app client ID (matches the Cognito IdP)',
            format: String,
            default: '',
            env: 'GH_OAUTH_APP_CLIENT_ID',
        },
        clientSecret: {
            doc: 'GitHub OAuth app client secret (matches the Cognito IdP)',
            format: String,
            default: '',
            env: 'GH_OAUTH_APP_CLIENT_SECRET',
            sensitive: true,
        },
    },
    wsTokenSecret: {
        doc: 'Dedicated HMAC key for signing WebSocket tokens (separate from Cognito client secret)',
        format: String,
        default: '',
        env: 'WS_TOKEN_SECRET',
        sensitive: true,
    },
    stateSecret: {
        doc: 'Dedicated HMAC key for signing OAuth state tokens (CSRF nonce binding for the login flow)',
        format: String,
        default: '',
        env: 'STATE_SECRET',
        sensitive: true,
    },
    mcpQuota: {
        budgetSeconds: {
            doc: 'Per-user MCP query-time budget per window, in seconds (each run_sql costs its execution duration)',
            format: Number,
            default: 600,
            env: 'MCP_QUERY_BUDGET_SECONDS',
        },
        windowSeconds: {
            doc: 'MCP query budget window length, in seconds',
            format: Number,
            default: 3600,
            env: 'MCP_QUERY_QUOTA_WINDOW_SECONDS',
        },
        maxQuerySeconds: {
            doc: 'Maximum duration of a single MCP run_sql query, in seconds (Postgres statement_timeout). keep below the API Lambda timeout.',
            format: Number,
            default: 20,
            env: 'MCP_QUERY_MAX_SECONDS',
        },
    },
    mcpServerUrl: {
        doc: 'Public URL of the MCP endpoint, used in OAuth Protected Resource Metadata (e.g. https://app.gitgazer.com/api/mcp). Falls back to the request domain when empty.',
        format: String,
        default: '',
        env: 'MCP_SERVER_URL',
    },
    mcpAllowedRedirectHosts: {
        doc: 'Hostnames accepted as HTTPS OAuth redirect targets for MCP clients (e.g. vscode.dev, claude.ai). Native-app loopback (127.0.0.1/localhost) is always allowed regardless of this list.',
        format: Array,
        default: ['vscode.dev', 'claude.ai'],
        env: 'MCP_ALLOWED_REDIRECT_HOSTS',
    },
    webhookQueueUrl: {
        doc: 'SQS queue URL for async webhook event processing',
        format: String,
        default: '',
        env: 'WEBHOOK_QUEUE_URL',
    },
    backfillQueueUrl: {
        doc: 'SQS queue URL for serverless GitHub backfill tasks',
        format: String,
        default: '',
        env: 'BACKFILL_QUEUE_URL',
    },
    httpProxyFunctionName: {
        doc: 'Lambda function name of the HTTP proxy for IPv4-only external services',
        format: String,
        default: '',
        env: 'HTTP_PROXY_FUNCTION_NAME',
    },
    sesConfig: {
        emailEnabled: {
            doc: 'Whether invitation email sending via SES is enabled (opt-in feature)',
            format: Boolean,
            default: false,
            env: 'SES_EMAIL_ENABLED',
        },
        fromEmail: {
            doc: 'Email address for sending notifications via AWS SES',
            format: String,
            default: '',
            env: 'SES_FROM_EMAIL',
        },
        configurationSet: {
            doc: 'AWS SES Configuration Set name for applying custom sending rules',
            format: String,
            default: '',
            env: 'SES_CONFIGURATION_SET',
        },
        appUrl: {
            doc: 'Frontend application URL used in email links',
            format: String,
            default: '',
            env: 'APP_URL',
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
        if (!secretValues) {
            throw new Error(`No secret values found at ARN ${secretArn}`);
        }

        config.load(secretValues);
    }
    config.validate({allowed: 'warn'});
    // Presence check runs only when config was loaded from Secrets Manager (real deploy / local
    // with a secret ARN). convict's validate() only checks types, not presence.
    if (secretArn) {
        assertCriticalConfig();
    }
};

/**
 * Fail closed on missing security-critical values. An empty HMAC secret makes OAuth state
 * forgeable, and without the MCP client id the MCP token verifier refuses every token and the
 * OAuth proxy hands out an empty client id — both would otherwise pass validate() silently.
 */
const assertCriticalConfig = (): void => {
    const missing: string[] = [];
    if (!config.get('stateSecret')) missing.push('stateSecret');
    if (!config.get('wsTokenSecret')) missing.push('wsTokenSecret');
    const {clientId, clientSecret, mcpClientId} = config.get('cognito');
    if (!clientSecret) missing.push('cognito.clientSecret');
    if (!clientId) missing.push('cognito.clientId');
    if (!mcpClientId) missing.push('cognito.mcpClientId');
    if (missing.length > 0) {
        throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }
};

export default config;
