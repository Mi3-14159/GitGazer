import {Logger} from '@aws-lambda-powertools/logger';
import {correlationPaths, search} from '@aws-lambda-powertools/logger/correlationId';

export const newLogger = (): Logger => {
    const logger = new Logger({
        environment: process.env.ENVIRONMENT,
        logBufferOptions: {
            enabled: true,
            maxBytes: 1024 * 1024 * 3, // 3 MB
            flushOnErrorLog: true,
        },
        correlationIdSearchFn: search,
    });
    return logger;
};

const logger = newLogger();

logger.injectLambdaContext({
    correlationIdPath: correlationPaths.API_GATEWAY_HTTP,
});

export const getLogger = (): Logger => logger;
