import {Logger} from '@aws-lambda-powertools/logger';
import {correlationPaths, search} from '@aws-lambda-powertools/logger/correlationId';
import {redactForLog} from './helpers/redact';

// `event` is the key logEventIfEnabled uses; `result` is the key handlers log responses under.
const REDACTED_LOG_KEYS = new Set(['event', 'result']);

export const newLogger = (): Logger => {
    const logger = new Logger({
        environment: process.env.ENVIRONMENT,
        logBufferOptions: {
            enabled: true,
            maxBytes: 1024 * 1024 * 3, // 3 MB
            flushOnErrorLog: true,
        },
        correlationIdSearchFn: search,
        jsonReplacerFn: (key, value) => (REDACTED_LOG_KEYS.has(key) ? redactForLog(value) : value),
    });
    return logger;
};

const logger = newLogger();

logger.injectLambdaContext({
    correlationIdPath: correlationPaths.API_GATEWAY_HTTP,
});

export const getLogger = (): Logger => logger;
