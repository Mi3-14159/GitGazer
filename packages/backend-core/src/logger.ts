import {Logger} from '@aws-lambda-powertools/logger';
import {search} from '@aws-lambda-powertools/logger/correlationId';
import {AsyncLocalStorage} from 'node:async_hooks';
import {redactForLog} from './helpers/redact';

// `event` is the key logEventIfEnabled uses; `result` is the key handlers log responses under.
const REDACTED_LOG_KEYS = new Set(['event', 'result']);

export const newLogger = (): Logger => {
    const logger = new Logger({
        environment: process.env.ENVIRONMENT,
        logBufferOptions: {
            // The buffer is keyed by one trace id per process, so on a Web Function a flush on error would dump other requests' lines
            enabled: !process.env.AWS_LAMBDA_HTTP_ENDPOINT,
            maxBytes: 1024 * 1024 * 3, // 3 MB
            flushOnErrorLog: true,
        },
        correlationIdSearchFn: search,
        jsonReplacerFn: (key, value) => (REDACTED_LOG_KEYS.has(key) ? redactForLog(value) : value),
    });
    return logger;
};

const logger = newLogger();

const requestLogger = new AsyncLocalStorage<Logger>();

export const getLogger = (): Logger => requestLogger.getStore() ?? logger;

export const runWithRequestLogger = <T>(keys: Record<string, string>, fn: () => Promise<T>): Promise<T> =>
    requestLogger.run(logger.createChild({persistentKeys: keys}), fn);
